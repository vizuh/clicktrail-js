/**
 * Journey-aware agent-run recording (`/agent`).
 *
 * Emits `agent.run.started` / `agent.run.finished` (incubating names)
 * through an INJECTED sink fn - the host wires `emit` to its ClickTrail
 * collector / webhook / otel lane later. Every event carries the run id,
 * journey_id/conversation_id linkage, an agent actor, and (finished only)
 * a metadata-only tool_calls summary.
 *
 * PRIVACY LAW (mirrored from /conversation): prompt/completion content is
 * never captured. Tool-call summaries are validated against an exact-key
 * allowlist ({ tool, ok, durationMs, error_code? }); any extra key throws
 * before storage or emission (see ./tool-call.ts).
 *
 * Determinism seams: the run id enters as injected randomness and ALL time
 * enters as CALLER-SUPPLIED timestamps. The recorder never reads a clock,
 * calls a timer, or measures durations itself - duration is derived PURELY
 * from the caller's start/end ISO timestamps (see durationMsBetween).
 */
import {
  ACTOR_TYPE_VALUE_AGENT,
  ATTR_AGENT_NAME,
  ATTR_AGENT_RUN_ID,
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  EVENT_AGENT_RUN_FINISHED,
  EVENT_AGENT_RUN_STARTED,
} from '@vizuh/clicktrail-core';
import { generateId } from '@vizuh/clicktrail-browser';
import type { RandomBytesFn } from '@vizuh/clicktrail-browser';
import { validateToolCall, validateToolCalls } from './tool-call.js';
import type { ToolCallSummary } from './tool-call.js';

/** Module-local incubating attributes (not yet in conventions/incubating). */
export const ATTR_RUN_DURATION_MS = 'agent.run.duration_ms' as const;
export const ATTR_RUN_STATUS = 'agent.run.status' as const;
export const ATTR_TOOL_CALLS = 'agent.tool_calls' as const;
export const RUN_STATUS_VALUE_OK = 'ok' as const;
export const RUN_STATUS_VALUE_ERROR = 'error' as const;

/** One emitted agent-run event, handed to the injected sink verbatim. */
export interface AgentRunEvent {
  name: string;
  data: Record<string, unknown>;
}

/**
 * Sink contract. The host owns delivery (collector/webhook/otel); tests
 * capture events into arrays. The recorder emits synchronously and never
 * swallows sink errors - a broken pipeline must be loud.
 */
export type AgentRunEmitFn = (event: AgentRunEvent) => void;

export interface AgentRunRecorderConfig {
  /** Injected sink every built event is handed to. */
  emit: AgentRunEmitFn;
  /**
   * Injected random-byte source for run-id generation. Default:
   * crypto.getRandomValues (resolved lazily at first use, never at import).
   */
  randomBytes?: RandomBytesFn;
}

/** Agent actor stamp: always type 'agent', with id and name required. */
export interface AgentActor {
  type: typeof ACTOR_TYPE_VALUE_AGENT;
  id: string;
  name: string;
}

export interface AgentRunStartInput {
  /** Durable journey linkage (from /conversation or the host's own). */
  journeyId?: string;
  /** Conversation linkage when the run serves a chat surface. */
  conversationId?: string;
  /** Actor identifier (agent/bot id). Required. */
  agentId: string;
  /** Human-readable agent name (also stamped as ATTR_AGENT_NAME). */
  agentName: string;
  /** CALLER-supplied millisecond ISO-8601 start timestamp. */
  startTime: string;
}

export interface AgentRunFinishInput {
  /** CALLER-supplied millisecond ISO-8601 end timestamp. */
  endTime: string;
  /** Run outcome. Default: RUN_STATUS_VALUE_OK. */
  ok?: boolean;
  /** Stable error code when ok === false. Codes only - never messages. */
  errorCode?: string;
  /**
   * Additional tool-call summaries. Each entry is validated fail-closed
   * ({ tool, ok, durationMs, error_code? } exact keys) before inclusion.
   */
  toolCalls?: readonly unknown[];
}

export interface AgentRunStartedRecord {
  readonly runId: string;
  readonly startTime: string;
  readonly journeyId?: string;
  readonly conversationId?: string;
  readonly event: AgentRunEvent;
}

export interface AgentRunFinishedRecord {
  readonly runId: string;
  readonly durationMs: number | null;
  readonly event: AgentRunEvent;
}

/** Live pairing handle returned by start(); finish() closes the pair. */
export interface AgentRunHandle extends AgentRunStartedRecord {
  /** Validate one summary (fail-closed) and accumulate it for finish(). */
  recordToolCall(raw: unknown): void;
  /** Summaries accumulated so far (defensive copy). */
  toolCalls(): readonly ToolCallSummary[];
  /** Emit the paired agent.run.finished event. One call only. */
  finish(input: AgentRunFinishInput): AgentRunFinishedRecord;
}

/**
 * PURE: milliseconds between two caller-supplied millisecond ISO-8601
 * timestamps, or null when either is unparseable or the pair regresses.
 * This is the ONLY duration computation in the subpath - no timers.
 */
export function durationMsBetween(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const delta = end - start;
  if (delta < 0) return null;
  return delta;
}

/** Injected-seam default: WebCrypto random bytes, resolved lazily. */
const defaultRandomBytes: RandomBytesFn = (byteLength) => {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto?.getRandomValues) {
    throw new Error(
      'clicktrail/agent: no crypto.getRandomValues available; inject randomBytes.',
    );
  }
  return crypto.getRandomValues(new Uint8Array(byteLength));
};

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value === '') {
    throw new Error('clicktrail/agent: "' + field + '" must be a non-empty string.');
  }
  return value;
};

const optionalId = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new Error('clicktrail/agent: "' + field + '" must be a string when present.');
  }
  return value;
};

/**
 * PURE builder for agent.run.started. Only fixed contract fields are emitted;
 * arbitrary caller data cannot enter this metadata-only event.
 */
export function buildAgentRunStarted(
  input: AgentRunStartInput,
  runId: string,
): AgentRunStartedRecord {
  const agentId = requireNonEmpty(input.agentId, 'agentId');
  const agentName = requireNonEmpty(input.agentName, 'agentName');
  const startTime = requireNonEmpty(input.startTime, 'startTime');
  const journeyId = optionalId(input.journeyId, 'journeyId');
  const conversationId = optionalId(input.conversationId, 'conversationId');

  const data: Record<string, unknown> = {};
  data[ATTR_AGENT_RUN_ID] = runId;
  data['actor'] = { type: ACTOR_TYPE_VALUE_AGENT, id: agentId, name: agentName };
  data[ATTR_AGENT_NAME] = agentName;
  data['event_time'] = startTime;
  if (journeyId !== undefined) data[ATTR_JOURNEY_ID] = journeyId;
  if (conversationId !== undefined) data[ATTR_CONVERSATION_ID] = conversationId;

  const base: AgentRunStartedRecord = {
    runId,
    startTime,
    ...(journeyId !== undefined ? { journeyId } : {}),
    ...(conversationId !== undefined ? { conversationId } : {}),
    event: { name: EVENT_AGENT_RUN_STARTED, data },
  };
  return base;
}

/**
 * PURE builder for the paired agent.run.finished event. Duration derives
 * ONLY from the two caller-supplied timestamps (null -> key omitted).
 */
export function buildAgentRunFinished(
  started: Pick<AgentRunStartedRecord, 'runId' | 'startTime' | 'journeyId' | 'conversationId'>,
  input: AgentRunFinishInput,
  accumulatedToolCalls: readonly ToolCallSummary[],
): AgentRunFinishedRecord {
  const endTime = requireNonEmpty(input.endTime, 'endTime');
  const ok = input.ok ?? true;
  let errorCode: string | undefined;
  if (input.errorCode !== undefined) {
    errorCode = requireNonEmpty(input.errorCode, 'errorCode');
  }

  const toolCalls = [...accumulatedToolCalls];
  if (input.toolCalls !== undefined) {
    for (const raw of validateToolCalls(input.toolCalls)) toolCalls.push(raw);
  }

  const data: Record<string, unknown> = {};
  data[ATTR_AGENT_RUN_ID] = started.runId;
  if (started.journeyId !== undefined) data[ATTR_JOURNEY_ID] = started.journeyId;
  if (started.conversationId !== undefined) data[ATTR_CONVERSATION_ID] = started.conversationId;
  data[ATTR_RUN_STATUS] = ok ? RUN_STATUS_VALUE_OK : RUN_STATUS_VALUE_ERROR;
  if (!ok && errorCode !== undefined) data['error_code'] = errorCode;
  const durationMs = durationMsBetween(started.startTime, endTime);
  if (durationMs !== null) data[ATTR_RUN_DURATION_MS] = durationMs;
  if (toolCalls.length > 0) data[ATTR_TOOL_CALLS] = toolCalls;
  data['event_time'] = endTime;

  return {
    runId: started.runId,
    durationMs,
    event: { name: EVENT_AGENT_RUN_FINISHED, data },
  };
}

/**
 * Create an agent-run recorder. Effects enter only through the injected
 * sink and (optionally) injected random bytes; all timing is argument-
 * supplied by the host.
 */
export function createAgentRunRecorder(config: AgentRunRecorderConfig): {
  start(input: AgentRunStartInput): AgentRunHandle;
} {
  const emit = config.emit;
  const randomBytes = config.randomBytes ?? defaultRandomBytes;

  return {
    start(input: AgentRunStartInput): AgentRunHandle {
      const runId = generateId(randomBytes);
      const started = buildAgentRunStarted(input, runId);
      emit(started.event);

      let finished = false;
      const calls: ToolCallSummary[] = [];

      return {
        runId: started.runId,
        startTime: started.startTime,
        ...(started.journeyId !== undefined ? { journeyId: started.journeyId } : {}),
        ...(started.conversationId !== undefined
          ? { conversationId: started.conversationId }
          : {}),
        event: started.event,

        recordToolCall(raw: unknown): void {
          calls.push(validateToolCall(raw));
        },

        toolCalls(): readonly ToolCallSummary[] {
          return [...calls];
        },

        finish(finishInput: AgentRunFinishInput): AgentRunFinishedRecord {
          if (finished) {
            throw new Error(
              'clicktrail/agent: run ' + started.runId + ' already finished.',
            );
          }
          finished = true;
          const done = buildAgentRunFinished(started, finishInput, calls);
          emit(done.event);
          return done;
        },
      };
    },
  };
}
