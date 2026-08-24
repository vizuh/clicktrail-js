/**
 * linkTrace: pure ai.trace_id stamping for correlation with external
 * tracing systems (Langfuse/Phoenix/otel). Input record is never mutated;
 * blank trace ids throw.
 */
import { describe, expect, it } from 'vitest';
import { ATTR_AI_TRACE_ID } from '@vizuh/clicktrail-core';
import { linkTrace } from '../src/agent/trace.js';

describe('linkTrace', () => {
  it('returns a copy with ai.trace_id set; original untouched', () => {
    const record = { [ATTR_AI_TRACE_ID]: undefined, agent_run_id: 'r-1', extra: { a: 1 } };
    const linked = linkTrace(record as Record<string, unknown>, '0af7651916cd43dd8448eb211c80319c');
    expect(linked[ATTR_AI_TRACE_ID]).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(linked['agent_run_id']).toBe('r-1');
    expect((record as Record<string, unknown>)[ATTR_AI_TRACE_ID]).toBeUndefined();
    expect(linked).not.toBe(record);
  });

  it('overrides any pre-existing trace id with the fresh link', () => {
    const linked = linkTrace({ [ATTR_AI_TRACE_ID]: 'old' }, 'new-trace');
    expect(linked[ATTR_AI_TRACE_ID]).toBe('new-trace');
  });

  it('throws on blank or non-string trace ids (fail-closed linking)', () => {
    expect(() => linkTrace({}, '')).toThrow(/non-empty/);
    expect(() => linkTrace({}, undefined as unknown as string)).toThrow(/non-empty/);
  });
});
