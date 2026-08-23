/**
 * journeySpanContext output validity: every derived traceparent matches the
 * strict W3C shape — version 00, 32-hex trace id, 16-hex span id, 2-hex
 * flags, non-zero components.
 */
import { describe, expect, it } from 'vitest';
import { journeySpanContext } from '../src/otel/traceparent.js';

const STRICT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

const events = [
  { id: 'cw-77/m-1', timestamp: '2026-08-23T10:00:00.000Z' },
  { id: 'run-42', timestamp: 1755937200000 },
  { id: 'lead.qualified:contact-9' },
  { id: 'a' },
  { id: 'x'.repeat(4096), timestamp: '1999-12-31T23:59:59.999Z' },
];

describe('journeySpanContext format', () => {
  it.each(events.map((e) => [e.id.slice(0, 24), e] as const))(
    'emits a valid W3C traceparent for %p',
    (_label, event) => {
      const ctx = journeySpanContext(event);
      expect(ctx.traceparent).toMatch(STRICT_RE);
      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(ctx.traceFlags).toBe('01');
      expect(ctx.traceparent).toBe(
        `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags}`,
      );
      expect(/^[0]+$/.test(ctx.traceId)).toBe(false);
      expect(/^[0]+$/.test(ctx.spanId)).toBe(false);
    },
  );
});
