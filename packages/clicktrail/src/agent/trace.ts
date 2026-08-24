/**
 * Trace linking (`/agent`).
 *
 * PURE helper: stamps an external OpenTelemetry trace id onto a record so
 * the agent run can be correlated with the model-call detail that tracing
 * vendors (Langfuse/Phoenix/otel) own. ClickTrail links via ai.trace_id;
 * it never replaces or re-records internal model-call spans.
 *
 * Determinism: no clock, no randomness, no I/O. The input record is never
 * mutated; a fresh object is returned.
 */
import { ATTR_AI_TRACE_ID } from '@vizuh/clicktrail-core';

/**
 * Return a copy of `record` with ATTR_AI_TRACE_ID set to `otelTraceId`.
 * Throws on an empty/non-string trace id (fail-closed: a blank link is
 * worse than a thrown instrumentation bug).
 */
export function linkTrace<T extends Record<string, unknown>>(
  record: T,
  otelTraceId: string,
): T & Record<typeof ATTR_AI_TRACE_ID, string> {
  if (typeof otelTraceId !== 'string' || otelTraceId === '') {
    throw new Error('clicktrail/agent: linkTrace needs a non-empty OpenTelemetry trace id.');
  }
  return { ...record, [ATTR_AI_TRACE_ID]: otelTraceId };
}
