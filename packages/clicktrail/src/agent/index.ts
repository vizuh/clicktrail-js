/**
 * @funnelsheet/clicktrail/agent - UNSTABLE entry point.
 *
 * Server-side recording of agent/automation runs tied to a ClickTrail
 * journey: agent.run.started / agent.run.finished through an injected
 * sink, metadata-only tool-call summaries, and pure ai.trace_id linking.
 *
 * Division of labor (docs/ARCHITECTURE.md): ClickTrail owns journey
 * correlation + business outcomes; Langfuse/Phoenix own internal
 * model-call detail. This subpath LINKS via ai.trace_id (linkTrace) and
 * never replaces those systems or records their content.
 *
 * PRIVACY LAW: prompt/completion content is never captured. Tool-call
 * summaries accept only { tool, ok, durationMs, error_code? } and reject
 * any object carrying extra keys (fail-closed).
 *
 * Determinism: run ids enter as injected randomness; ALL timestamps are
 * caller-supplied arguments. The recorder never reads a clock or calls a
 * timer; import is side-effect free.
 */
export {
  ATTR_RUN_DURATION_MS,
  ATTR_RUN_STATUS,
  ATTR_TOOL_CALLS,
  RUN_STATUS_VALUE_ERROR,
  RUN_STATUS_VALUE_OK,
  buildAgentRunFinished,
  buildAgentRunStarted,
  createAgentRunRecorder,
  durationMsBetween,
} from './recorder.js';
export type {
  AgentActor,
  AgentRunEmitFn,
  AgentRunEvent,
  AgentRunFinishInput,
  AgentRunFinishedRecord,
  AgentRunHandle,
  AgentRunRecorderConfig,
  AgentRunStartInput,
  AgentRunStartedRecord,
} from './recorder.js';
export { TOOL_CALL_KEYS, validateToolCall, validateToolCalls } from './tool-call.js';
export type { ToolCallSummary } from './tool-call.js';
export { linkTrace } from './trace.js';
