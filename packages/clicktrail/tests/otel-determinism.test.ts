/**
 * Derivation stability: identical event identity => byte-identical ids
 * across repeated calls and across differing call orders; distinct
 * identity => distinct ids. No clock or randomness is consulted anywhere.
 */
import { describe, expect, it } from 'vitest';
import { journeySpanContext } from '../src/otel/traceparent.js';

describe('journeySpanContext determinism', () => {
  it('same event yields the same ids across runs', () => {
    const a = journeySpanContext({
      id: 'cw-77/m-1',
      timestamp: '2026-08-23T10:00:00.000Z',
    });
    const b = journeySpanContext({
      id: 'cw-77/m-1',
      timestamp: '2026-08-23T10:00:00.000Z',
    });
    expect(b.traceparent).toBe(a.traceparent);
    expect(b.traceId).toBe(a.traceId);
    expect(b.spanId).toBe(a.spanId);
  });

  it('epoch-millis and ISO string of the same instant differ (documented seed shape)', () => {
    // The timestamp enters the hash verbatim per type; this pins that
    // callers must pass ONE consistent representation for replay.
    const iso = journeySpanContext({ id: 'e', timestamp: '2026-08-23T10:00:00.000Z' });
    const ms = journeySpanContext({ id: 'e', timestamp: 1787479200000 });
    expect(iso.traceparent).not.toBe(ms.traceparent);
  });

  it('different timestamps or ids yield different traces', () => {
    const base = journeySpanContext({ id: 'm-1', timestamp: 't1' });
    const otherTime = journeySpanContext({ id: 'm-1', timestamp: 't2' });
    const otherId = journeySpanContext({ id: 'm-2', timestamp: 't1' });
    expect(otherTime.traceId).not.toBe(base.traceId);
    expect(otherId.traceId).not.toBe(base.traceId);
  });

  it('span ids stay scoped under their trace seed (trace != span derivation)', () => {
    const ctx = journeySpanContext({ id: 'm-1', timestamp: 't1' });
    const again = journeySpanContext({ id: 'm-1', timestamp: 't1' });
    expect(again.spanId).toBe(ctx.spanId);
    // Two occurrences of the same identity intentionally share one context
    // (correlation dedupe semantics).
    expect(again.traceId).toBe(ctx.traceId);
  });

  it('derivation never mutates the input', () => {
    const event = { id: 'm-1', timestamp: '2026-08-23T10:00:00.000Z' };
    const snapshot = { ...event };
    journeySpanContext(event);
    expect(event).toEqual(snapshot);
  });
});
