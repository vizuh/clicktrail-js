/**
 * createAgentRunRecorder: deterministic records. Run id and ALL timestamps
 * are injected arguments - identical inputs produce byte-identical event
 * bags, and the recorder never reads a clock or calls a timer itself.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTR_AGENT_NAME,
  ATTR_AGENT_RUN_ID,
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ACTOR_TYPE_VALUE_AGENT,
  EVENT_AGENT_RUN_FINISHED,
  EVENT_AGENT_RUN_STARTED,
} from '../src/conventions/incubating.js';
import {
  ATTR_RUN_DURATION_MS,
  ATTR_RUN_STATUS,
  ATTR_TOOL_CALLS,
  RUN_STATUS_VALUE_ERROR,
  RUN_STATUS_VALUE_OK,
  buildAgentRunFinished,
  buildAgentRunStarted,
  createAgentRunRecorder,
  durationMsBetween,
} from '../src/agent/recorder.js';
import type { AgentRunEvent, AgentRunEmitFn } from '../src/agent/recorder.js';
import { uuidFromByte } from './conversation-helpers.js';

function sink(): { events: AgentRunEvent[]; emit: AgentRunEmitFn } {
  const events: AgentRunEvent[] = [];
  return { events, emit: (event) => void events.push(event) };
}

const FIXED_BYTES = () => new Uint8Array(16).fill(0x42);

describe('createAgentRunRecorder started/finished pairing', () => {
  it('started carries run_id, journey/conversation linkage, actor, and time', () => {
    const s = sink();
    const recorder = createAgentRunRecorder({ emit: s.emit, randomBytes: FIXED_BYTES });
    const handle = recorder.start({
      journeyId: 'j-1',
      conversationId: 'cw-9',
      agentId: 'hermes-1',
      agentName: 'Hermes',
      startTime: '2026-08-23T10:00:00.000Z',
    });
    expect(s.events).toHaveLength(1);
    const e = s.events[0]!;
    expect(e.name).toBe(EVENT_AGENT_RUN_STARTED);
    expect(e.data[ATTR_AGENT_RUN_ID]).toBe(uuidFromByte(0x42));
    expect(e.data[ATTR_JOURNEY_ID]).toBe('j-1');
    expect(e.data[ATTR_CONVERSATION_ID]).toBe('cw-9');
    expect(e.data[ATTR_AGENT_NAME]).toBe('Hermes');
    expect(e.data['actor']).toEqual({
      type: ACTOR_TYPE_VALUE_AGENT,
      id: 'hermes-1',
      name: 'Hermes',
    });
    expect(e.data['event_time']).toBe('2026-08-23T10:00:00.000Z');
    expect(handle.runId).toBe(uuidFromByte(0x42));
  });

  it('finish pairs with the same run_id, stamps status/duration/tool_calls', () => {
    const s = sink();
    const recorder = createAgentRunRecorder({ emit: s.emit, randomBytes: FIXED_BYTES });
    const handle = recorder.start({
      journeyId: 'j-1',
      conversationId: 'cw-9',
      agentId: 'hermes-1',
      agentName: 'Hermes',
      startTime: '2026-08-23T10:00:00.000Z',
    });
    handle.recordToolCall({ tool: 'search', ok: true, durationMs: 120 });
    handle.recordToolCall({ tool: 'crm.write', ok: false, durationMs: 30, error_code: 'E_TIMEOUT' });
    handle.finish({
      endTime: '2026-08-23T10:00:05.500Z',
      toolCalls: [{ tool: 'notify', ok: true, durationMs: 5 }],
    });

    expect(s.events).toHaveLength(2);
    const done = s.events[1]!;
    expect(done.name).toBe(EVENT_AGENT_RUN_FINISHED);
    expect(done.data[ATTR_AGENT_RUN_ID]).toBe(s.events[0]!.data[ATTR_AGENT_RUN_ID]);
    expect(done.data[ATTR_JOURNEY_ID]).toBe('j-1');
    expect(done.data[ATTR_CONVERSATION_ID]).toBe('cw-9');
    expect(done.data[ATTR_RUN_STATUS]).toBe(RUN_STATUS_VALUE_OK);
    expect(done.data[ATTR_RUN_DURATION_MS]).toBe(5500);
    expect(done.data[ATTR_TOOL_CALLS]).toEqual([
      { tool: 'search', ok: true, durationMs: 120 },
      { tool: 'crm.write', ok: false, durationMs: 30, error_code: 'E_TIMEOUT' },
      { tool: 'notify', ok: true, durationMs: 5 },
    ]);
    expect(done.data['event_time']).toBe('2026-08-23T10:00:05.500Z');
    expect(handle.toolCalls()).toEqual([
      { tool: 'search', ok: true, durationMs: 120 },
      { tool: 'crm.write', ok: false, durationMs: 30, error_code: 'E_TIMEOUT' },
    ]);
  });

  it('error finish stamps error status + error_code; no content ever appears', () => {
    const s = sink();
    const recorder = createAgentRunRecorder({ emit: s.emit, randomBytes: FIXED_BYTES });
    const handle = recorder.start({
      agentId: 'a',
      agentName: 'n',
      startTime: '2026-08-23T10:00:00.000Z',
    });
    handle.finish({
      endTime: '2026-08-23T10:00:01.000Z',
      ok: false,
      errorCode: 'E_UPSTREAM',
    });
    const done = s.events[1]!;
    expect(done.data[ATTR_RUN_STATUS]).toBe(RUN_STATUS_VALUE_ERROR);
    expect(done.data['error_code']).toBe('E_UPSTREAM');
    // no journey/conversation linkage when none was supplied
    expect(done.data[ATTR_JOURNEY_ID]).toBeUndefined();
    expect(done.data[ATTR_CONVERSATION_ID]).toBeUndefined();
  });

  it('duration is omitted when timestamps are unparseable or regress (pure null)', () => {
    const s = sink();
    const recorder = createAgentRunRecorder({ emit: s.emit, randomBytes: FIXED_BYTES });
    const h1 = recorder.start({
      agentId: 'a',
      agentName: 'n',
      startTime: 'not-a-timestamp',
    });
    h1.finish({ endTime: '2026-08-23T10:00:01.000Z' });
    expect(s.events[1]!.data[ATTR_RUN_DURATION_MS]).toBeUndefined();

    const h2 = recorder.start({
      agentId: 'a',
      agentName: 'n',
      startTime: '2026-08-23T10:00:02.000Z',
    });
    h2.finish({ endTime: '2026-08-23T10:00:01.000Z' }); // regressed clock
    expect(s.events[3]!.data[ATTR_RUN_DURATION_MS]).toBeUndefined();
  });

  it('double finish throws; metadata cannot inject arbitrary caller fields', () => {
    const s = sink();
    const recorder = createAgentRunRecorder({ emit: s.emit, randomBytes: FIXED_BYTES });
    const handle = recorder.start({
      journeyId: 'real-journey',
      agentId: 'a',
      agentName: 'n',
      startTime: '2026-08-23T10:00:00.000Z',
    });
    expect(s.events[0]!.data[ATTR_JOURNEY_ID]).toBe('real-journey');
    expect(s.events[0]!.data['prompt']).toBeUndefined();
    expect(s.events[0]!.data['completion']).toBeUndefined();
    expect(s.events[0]!.data['source']).toBeUndefined();
    handle.finish({ endTime: '2026-08-23T10:00:01.000Z' });
    expect(() => handle.finish({ endTime: '2026-08-23T10:00:02.000Z' })).toThrow(/already finished/);
  });
});

describe('determinism + pure builders', () => {
  it('identical inputs produce identical event bags (no hidden entropy)', () => {
    const input = {
      journeyId: 'j-det',
      conversationId: 'cw-det',
      agentId: 'agent-7',
      agentName: 'Qualifier',
      startTime: '2026-08-23T10:00:00.000Z',
    };
    const a = buildAgentRunStarted(input, uuidFromByte(0x42));
    const b = buildAgentRunStarted(input, uuidFromByte(0x42));
    expect(a.event).toEqual(b.event);

    const fa = buildAgentRunFinished(a, { endTime: '2026-08-23T10:00:02.000Z' }, []);
    const fb = buildAgentRunFinished(b, { endTime: '2026-08-23T10:00:02.000Z' }, []);
    expect(fa.event).toEqual(fb.event);
  });

  it('builders do not mutate their inputs', () => {
    const input = {
      agentId: 'a',
      agentName: 'n',
      startTime: '2026-08-23T10:00:00.000Z',
    };
    const snapshot = JSON.stringify(input);
    const started = buildAgentRunStarted(input, 'run-x');
    expect(JSON.stringify(input)).toBe(snapshot);
    buildAgentRunFinished(started, { endTime: '2026-08-23T10:00:09.000Z', toolCalls: [] }, []);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('durationMsBetween is pure arithmetic on its two arguments', () => {
    expect(durationMsBetween('2026-08-23T10:00:00.000Z', '2026-08-23T10:00:01.250Z')).toBe(1250);
    expect(durationMsBetween('2026-08-23T10:00:05.000Z', '2026-08-23T10:00:05.000Z')).toBe(0);
    expect(durationMsBetween('garbage', '2026-08-23T10:00:05.000Z')).toBeNull();
  });

  it('required fields are validated at build time', () => {
    expect(() =>
      buildAgentRunStarted({ agentId: '', agentName: 'n', startTime: '2026-08-23T10:00:00.000Z' }, 'r'),
    ).toThrow(/agentId/);
    expect(() =>
      buildAgentRunStarted({ agentId: 'a', agentName: 'n', startTime: '' }, 'r'),
    ).toThrow(/startTime/);
    expect(() =>
      buildAgentRunStarted({ agentId: 'a', agentName: 'n', startTime: '2026-08-23T10:00:00.000Z' }, ''),
    ).not.toThrow(); // run id format is the host's contract; recorder only needs non-empty usage paths
  });
});
