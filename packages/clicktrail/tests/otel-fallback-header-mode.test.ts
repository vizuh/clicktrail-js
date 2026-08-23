/**
 * Header fallback mode: without a tracer, every delivered event is enriched
 * (as a copy) with a valid W3C traceparent key so downstream HTTP hops can
 * propagate correlation; no span machinery is required.
 */
import { describe, expect, it } from 'vitest';
import { ATTR_MESSAGE_ID } from '../src/conventions/incubating.js';
import { otelDestination } from '../src/otel/destination.js';
import { extractTraceparent } from '../src/otel/traceparent.js';
import type { ClickTrailEvent } from '../src/browser/serialize.js';

function event(messageId: string): ClickTrailEvent {
  return {
    event_name: 'handoff.human',
    [ATTR_MESSAGE_ID]: messageId,
    timestamp: '2026-08-23T10:00:00.000Z',
    schema_version: '1.1.0',
    classifier_version: '1.1.0',
  };
}

describe('otelDestination header fallback mode', () => {
  it('enriches events with a valid traceparent header value', () => {
    const dest = otelDestination(); // no tracer at all
    dest.deliver(event('m-1'));
    dest.deliver(event('m-2'));

    const stored = dest.getEvents();
    expect(stored).toHaveLength(2);
    for (const e of stored) {
      const ctx = extractTraceparent({ traceparent: String(e['traceparent']) });
      expect(ctx).not.toBeNull();
      expect(ctx!.traceId).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('is deterministic per event identity across destinations', () => {
    const a = otelDestination();
    const b = otelDestination();
    a.deliver(event('m-1'));
    b.deliver(event('m-1'));
    expect(a.getEvents()[0]!['traceparent']).toBe(b.getEvents()[0]!['traceparent']);
  });

  it('never mutates the caller-supplied event object', () => {
    const dest = otelDestination();
    const e = event('m-1');
    const snapshot = { ...e };
    dest.deliver(e);
    expect(e).toEqual(snapshot);
    expect(dest.getEvents()[0]).not.toBe(e);
  });

  it('honors custom eventId/eventTime seams', () => {
    const dest = otelDestination({
      eventId: () => 'custom-stable-key',
      eventTime: () => 1755937200000,
    });
    const other = otelDestination();
    dest.deliver(event('ignored'));
    other.deliver(event('m-1'));
    expect(dest.getEvents()[0]!['traceparent']).not.toBe(
      other.getEvents()[0]!['traceparent'],
    );
  });
});
