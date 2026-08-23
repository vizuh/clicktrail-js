/**
 * Fail-closed inputs: missing/empty/non-string event ids throw; unparsable
 * or unsafe inbound headers return null instead of throwing (propagation
 * stays best-effort); all-zero W3C ids are rejected as invalid.
 */
import { describe, expect, it } from 'vitest';
import { extractTraceparent, journeySpanContext } from '../src/otel/traceparent.js';

describe('journeySpanContext invalid inputs', () => {
  it.each([
    ['empty string', ''],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('throws fail-closed on %s event id', (_label, bad) => {
    expect(() =>
      journeySpanContext({ id: bad as unknown as string }),
    ).toThrow(/non-empty string event id/);
  });

  it('tolerates a missing timestamp but not a missing id', () => {
    expect(() => journeySpanContext({ id: 'm-1' })).not.toThrow();
  });
});

describe('extractTraceparent invalid inputs', () => {
  it.each([
    ['not a header at all', {}],
    ['empty value', { traceparent: '' }],
    ['garbage', { traceparent: 'hello-world' }],
    ['wrong component count', { traceparent: '00-abc-01' }],
    ['short trace id', { traceparent: `00-${'a'.repeat(31)}-${'b'.repeat(16)}-01` }],
    ['long span id', { traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(17)}-01` }],
    ['non-hex chars', { traceparent: `00-${'g'.repeat(32)}-${'b'.repeat(16)}-01` }],
    ['all-zero trace id', { traceparent: `00-${'0'.repeat(32)}-${'b'.repeat(16)}-01` }],
    ['all-zero span id', { traceparent: `00-${'a'.repeat(32)}-${'0'.repeat(16)}-01` }],
    ['ff version', { traceparent: `ff-${'a'.repeat(32)}-${'b'.repeat(16)}-01` }],
  ])('returns null for %s', (_label, headers) => {
    expect(extractTraceparent(headers as Record<string, string>)).toBeNull();
  });

  it('returns null when the Headers-like get() yields null', () => {
    expect(extractTraceparent({ get: () => null })).toBeNull();
  });
});
