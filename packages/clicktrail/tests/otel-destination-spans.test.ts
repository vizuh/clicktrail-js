/**
 * Tracer mode: otelDestination with an injected tracer-like object emits
 * one span per event, named after the event, carrying canonical ATTR_*
 * attribute keys (dotted payload keys pass through verbatim) and ending
 * each span.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ATTR_MESSAGE_ID,
} from '../src/conventions/incubating.js';
import { ATTR_EVENT_NAME, ATTR_EVENT_TIME, otelDestination } from '../src/otel/destination.js';
import type { OtelSpanLike } from '../src/otel/destination.js';
import type { StampedClickTrailEvent } from '../src/browser/serialize.js';

interface RecordedSpan {
  name: string;
  options?: Record<string, unknown> | undefined;
  attributes: Record<string, unknown>;
  ended: boolean;
}

function fakeTracer() {
  const spans: RecordedSpan[] = [];
  const tracer = {
    startSpan(name: string, options?: Record<string, unknown>): OtelSpanLike {
      const span: RecordedSpan = {
        name,
        options,
        attributes: {},
        ended: false,
      };
      spans.push(span);
      return {
        setAttribute(key: string, value: unknown) {
          span.attributes[key] = value;
          return span;
        },
        end() {
          span.ended = true;
        },
      };
    },
  };
  return { spans, tracer };
}

function journeyEvent(): StampedClickTrailEvent {
  return {
    event_name: 'conversation.started',
    [ATTR_JOURNEY_ID]: 'j-abc',
    [ATTR_CONVERSATION_ID]: 'cw-77',
    [ATTR_MESSAGE_ID]: 'm-1',
    timestamp: '2026-08-23T10:00:00.000Z',
    schema_version: '1.2.0',
    classifier_version: '1.2.0',
  };
}

describe('otelDestination tracer mode', () => {
  it('emits one attributed, ended span per delivered event', () => {
    const { spans, tracer } = fakeTracer();
    const dest = otelDestination({ tracer });
    dest.deliver(journeyEvent());
    dest.deliver(journeyEvent());

    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span.name).toBe('conversation.started');
      expect(span.attributes[ATTR_EVENT_NAME]).toBe('conversation.started');
      expect(span.attributes[ATTR_EVENT_TIME]).toBe('2026-08-23T10:00:00.000Z');
      expect(span.attributes[ATTR_JOURNEY_ID]).toBe('j-abc');
      expect(span.attributes[ATTR_MESSAGE_ID]).toBe('m-1');
      expect(span.ended).toBe(true);
    }
  });

  it('passes startSpan options through structurally (SDK-compatible call shape)', () => {
    const { spans, tracer } = fakeTracer();
    otelDestination({ tracer }).deliver(journeyEvent());
    expect(spans[0]!.options).toBeDefined();
    const attrs = spans[0]!.options!['attributes'] as Record<string, unknown>;
    expect(attrs[ATTR_EVENT_NAME]).toBe('conversation.started');
    expect(attrs[ATTR_MESSAGE_ID]).toBe('m-1');
  });

  it('skips null/undefined and non-dotted payload keys when building attributes', () => {
    const { spans, tracer } = fakeTracer();
    const dest = otelDestination({ tracer });
    dest.deliver({
      ...journeyEvent(),
      event_name: 'lead.qualified',
      [ATTR_CONVERSATION_ID]: undefined,
      not_an_attribute: 'skip me',
    });
    expect(spans[0]!.attributes[ATTR_EVENT_NAME]).toBe('lead.qualified');
    expect(ATTR_CONVERSATION_ID in spans[0]!.attributes).toBe(false);
    expect('not_an_attribute' in spans[0]!.attributes).toBe(false);
  });

  it('still enriches the buffered payload with traceparent in tracer mode', () => {
    const { tracer } = fakeTracer();
    const dest = otelDestination({ tracer });
    dest.deliver(journeyEvent());
    const stored = dest.getEvents()[0]!;
    expect(stored['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    // Original input never mutated:
    expect(journeyEvent()['traceparent']).toBeUndefined();
  });
});
