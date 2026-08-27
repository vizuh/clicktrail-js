/**
 * @vizuh/clicktrail/otel - UNSTABLE entry point.
 *
 * Event bridge between ClickTrail journeys and OpenTelemetry WITHOUT
 * requiring the OTel SDK. "OpenTelemetry-compatible, not
 * OpenTelemetry-dependent" (docs/ARCHITECTURE.md): zero @opentelemetry/*
 * imports. Loggers enter as plain structural objects.
 *
 * ClickTrail facts map to OTel EventRecords through the Logs API. Host code
 * owns active trace context, sampling, processors, and export. Traceparent
 * helpers remain explicit correlation utilities; the destination never
 * invents trace context.
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
export { otelDestination } from './destination.js';
export type {
  OtelAttributeValue,
  OtelDestination,
  OtelDestinationConfig,
  OtelEventRecordLike,
  OtelLoggerLike,
} from './destination.js';
