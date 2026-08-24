/**
 * OpenTelemetry-shaped destination (`/otel`).
 *
 * Destination-compatible sink that bridges stamped ClickTrail events into
 * OTel-shaped context. Two modes, composable:
 *
 * - TRACER MODE: an injected tracer-LIKE object (minimal structural
 *   interface: startSpan/setAttribute/end) receives each event as a span
 *   carrying canonical ATTR_* attributes. Structural typing only — we never
 *   import @opentelemetry/* (docs/ARCHITECTURE.md design law), so the real
 *   SDK's Tracer satisfies this interface as-is.
 *
 * - HEADER FALLBACK MODE: with or without a tracer, every delivered event
 *   is enriched (copy, never mutate) with a W3C `traceparent` payload key,
 *   so downstream HTTP hops propagate correlation even when no tracing
 *   vendor exists.
 *
 * Effects: none at import; span emission happens inside deliver() through
 * the injected tracer. Determinism: span ids derive from event identity via
 * journeySpanContext — CORRELATION ids, not high-entropy secrets.
 */
import type { StampedClickTrailEvent } from '../browser/serialize.js';
import type { Destination } from '../browser/transport.js';
import {
  ATTR_TRACEPARENT,
  defaultEventId,
  defaultEventTimestamp,
  journeySpanContext,
} from './traceparent.js';

/**
 * Minimal structural slice of an OTel Span we rely on. The real SDK Span
 * satisfies this; tests inject fakes.
 */
export interface OtelSpanLike {
  setAttribute(key: string, value: unknown): unknown;
  /** Optional so lightweight fakes stay valid; real spans always have it. */
  end?(endTime?: unknown): void;
}

/**
 * Minimal structural slice of an OTel Tracer. Extra SDK parameters are
 * irrelevant to us; only this call shape is consumed.
 */
export interface OtelTracerLike {
  startSpan(name: string, options?: Record<string, unknown>): OtelSpanLike;
}

export interface OtelDestinationConfig {
  /**
   * Injected tracer-like sink. Omit for pure header-propagation mode
   * (no vendor dependency at all).
   */
  tracer?: OtelTracerLike;
  /**
   * Stable identity extractor. Default {@link defaultEventId} (message id →
   * agent run id → event name). MUST be deterministic across replays.
   */
  eventId?: (event: StampedClickTrailEvent) => string;
  /**
   * Timestamp extractor feeding the id seed. Default {@link defaultEventTimestamp}.
   */
  eventTime?: (event: StampedClickTrailEvent) => string | number | undefined;
}

export interface OtelDestination extends Destination {
  /**
   * Delivered events, each enriched with the W3C `traceparent` key.
   * Inspection seam for tests and for hosts forwarding downstream.
   */
  getEvents(): StampedClickTrailEvent[];
}

/** Attribute keys this destination always sets on emitted spans. */
export const ATTR_EVENT_NAME = 'event.name' as const;
export const ATTR_EVENT_TIME = 'event.time' as const;

/**
 * Build the `/otel` destination. Never touches a clock, randomness, or the
 * network itself; all effects flow through the injected tracer.
 */
export function otelDestination(config: OtelDestinationConfig = {}): OtelDestination {
  const eventId = config.eventId ?? defaultEventId;
  const eventTime = config.eventTime ?? defaultEventTimestamp;
  const tracer = config.tracer;
  const events: StampedClickTrailEvent[] = [];

  return {
    name: 'otel',
    deliver(event) {
      const time = eventTime(event);
      const ctx = journeySpanContext({
        id: eventId(event),
        ...(time !== undefined ? { timestamp: time } : {}),
      });
      const enriched: StampedClickTrailEvent = { ...event, [ATTR_TRACEPARENT]: ctx.traceparent };
      events.push(enriched);

      if (!tracer) return;
      // Attribute pass-through rule: canonical ATTR_* keys are dotted
      // ('journey.id', 'conversation.id', ...). Every dotted key present on
      // the stamped payload IS an attribute by construction — copy verbatim.
      const attributes: Record<string, unknown> = {
        [ATTR_EVENT_NAME]: event.event_name,
      };
      if (time !== undefined) attributes[ATTR_EVENT_TIME] = time;
      for (const [key, value] of Object.entries(event)) {
        if (key.includes('.') && value !== undefined && value !== null) {
          if (!(key in attributes)) attributes[key] = value;
        }
      }
      const span = tracer.startSpan(event.event_name, { attributes });
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      span.end?.();
    },
    getEvents() {
      return events;
    },
  };
}
