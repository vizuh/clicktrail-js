import { describe, expect, it } from 'vitest';
import { otelDestination } from '../src/otel/destination.js';
import type { StampedClickTrailEvent } from '@vizuh/clicktrail-browser';

function event(): StampedClickTrailEvent {
  return {
    event_name: 'sale.completed',
    schema_version: '1.2.0',
    classifier_version: '1.2.0',
  };
}

describe('otelDestination inspection buffer', () => {
  it('normalizes a copy without inventing trace context', () => {
    const input = event();
    const dest = otelDestination();
    dest.deliver(input);

    expect(dest.getEvents()).toEqual([{ ...input, event_name: 'sale' }]);
    expect(dest.getEvents()[0]).not.toBe(input);
    expect(dest.getEvents()[0]!['traceparent']).toBeUndefined();
    expect(input.event_name).toBe('sale.completed');
  });

  it('clears buffered events', () => {
    const dest = otelDestination();
    dest.deliver(event());
    dest.clear?.();
    expect(dest.getEvents()).toEqual([]);
  });
});
