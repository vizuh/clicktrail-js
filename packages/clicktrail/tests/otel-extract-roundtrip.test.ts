/**
 * Inbound propagation: extractTraceparent parses what journeySpanContext
 * emits (roundtrip via both plain records and Headers-like objects), is
 * case-insensitive on header names, and rejects foreign versions.
 */
import { describe, expect, it } from 'vitest';
import {
  extractTraceparent,
  journeySpanContext,
} from '../src/otel/traceparent.js';

describe('extractTraceparent roundtrip', () => {
  it('recovers identical ids from a derived traceparent', () => {
    const derived = journeySpanContext({
      id: 'cw-77/m-1',
      timestamp: '2026-08-23T10:00:00.000Z',
    });
    const parsed = extractTraceparent({ traceparent: derived.traceparent });
    expect(parsed).toEqual(derived);
    expect(parsed!.traceId).toBe(derived.traceId);
    expect(parsed!.spanId).toBe(derived.spanId);
  });

  it('reads from a Headers-like object', () => {
    const derived = journeySpanContext({ id: 'run-42', timestamp: 1755937200000 });
    const headersLike = { get: (name: string) => (name === 'traceparent' ? derived.traceparent : null) };
    expect(extractTraceparent(headersLike)!.traceparent).toBe(derived.traceparent);
    // Case-insensitive name lookup on the get() seam too:
    const upper = { get: (name: string) => (name === 'TRACEPARENT' ? derived.traceparent : null) };
    expect(extractTraceparent(upper)).not.toBeNull();
  });

  it('is case-insensitive for record keys and tolerant of header value case', () => {
    const derived = journeySpanContext({ id: 'm-9' });
    const upperValue = derived.traceparent.toUpperCase();
    // Uppercase hex still parses after normalization:
    expect(extractTraceparent({ TraceParent: upperValue })!.traceId).toBe(
      derived.traceId,
    );
  });

  it('rejects non-00 versions explicitly', () => {
    const derived = journeySpanContext({ id: 'm-1' });
    const v01 = derived.traceparent.replace('00-', '01-',);
    expect(v01.startsWith('01-')).toBe(true);
    expect(extractTraceparent({ traceparent: v01 })).toBeNull();
  });
});
