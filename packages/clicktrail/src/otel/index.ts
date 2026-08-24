/**
 * @vizuh/clicktrail/otel - UNSTABLE entry point.
 *
 * Correlation bridge between ClickTrail journeys and OpenTelemetry-SHAPED
 * context WITHOUT requiring the OTel SDK. "OpenTelemetry-compatible, not
 * OpenTelemetry-dependent" (docs/ARCHITECTURE.md): zero @opentelemetry/*
 * imports anywhere in this subpath — tracers enter as plain structural
 * objects, ids are derived locally.
 *
 * What this subpath is NOT: it does not record model-call spans, does not
 * replace Langfuse/Phoenix, and does not sample or export telemetry. It
 * derives and propagates CORRELATION identity (W3C traceparent) for journey
 * events, optionally mirroring them into an injected tracer as attributed
 * spans.
 *
 * SECURITY NOTICE: derived trace/span ids use non-cryptographic FNV-1a over
 * event identity. They are correlation keys, reproducible by anyone who
 * knows the event id — never security tokens.
 *
 * Determinism: same event id + timestamp => byte-identical traceparent
 * across runs and machines. No clock, no randomness, no I/O at import.
 */
export {
  ATTR_TRACEPARENT,
  TRACEPARENT_VERSION,
  TRACE_FLAGS_SAMPLED,
  defaultEventId,
  defaultEventTimestamp,
  extractTraceparent,
  journeySpanContext,
} from './traceparent.js';
export type {
  JourneyEventRef,
  JourneySpanContext,
  TraceparentSource,
} from './traceparent.js';
export {
  ATTR_EVENT_NAME,
  ATTR_EVENT_TIME,
  otelDestination,
} from './destination.js';
export type {
  OtelDestination,
  OtelDestinationConfig,
  OtelSpanLike,
  OtelTracerLike,
} from './destination.js';
