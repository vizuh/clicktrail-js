/**
 * Explicit W3C Trace Context correlation helpers (`/otel`).
 *
 * PURE helpers: derive a deterministic traceparent from a journey event's
 * stable identity, and parse inbound traceparent headers. NO @opentelemetry/*
 * imports — OpenTelemetry-COMPATIBLE, never OpenTelemetry-DEPENDENT
 * (docs/ARCHITECTURE.md design law). The OTel destination does not call these
 * helpers: host instrumentation owns actual propagation context.
 *
 * DETERMINISM LAW: trace/span ids are derived from the event id (+ its
 * caller-supplied timestamp) via a seeded FNV-1a hash chain. Same event,
 * same ids — across runs, processes, and machines. Stable replay is the
 * point; randomness is never consulted.
 *
 * CORRELATION-NOT-CRYPTOGRAPHY NOTICE: FNV-1a is a fast, non-cryptographic
 * hash. These ids exist to CORRELATE journey events across HTTP hops and
 * tracing vendors. They are NOT high-entropy security tokens: an attacker
 * who knows an event id can reproduce its ids. Never use them for auth,
 * capability URLs, or anything secret-bearing.
 */
import { ATTR_AGENT_RUN_ID, ATTR_MESSAGE_ID } from '@vizuh/clicktrail-core';

/** Fixed W3C traceparent version this module emits and parses. */
export const TRACEPARENT_VERSION = '00';

/**
 * Sampled flag (`01`). Correlation consumers typically keep sampled spans;
 * the flag travels verbatim so downstream vendors see consistent intent.
 */
export const TRACE_FLAGS_SAMPLED = '01';

/** Payload key the fallback header mode attaches the traceparent under. */
export const ATTR_TRACEPARENT = 'traceparent';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const TRACEPATTERN_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const ALL_ZERO_RE = /^0+$/;

/** Minimal identity a journey event must expose for id derivation. */
export interface JourneyEventRef {
  /**
   * Stable journey event identifier. This is the determinism anchor: the
   * SAME id MUST be reproducible on replay (message ids, run ids, or a
   * caller-composed stable key — not a random uuid minted at emit time).
   */
  id: string;
  /**
   * Caller-supplied event timestamp (ISO-8601 millisecond string or epoch
   * millis). Enters the hash so distinct occurrences of a reused event id
   * still derive distinct traces.
   */
  timestamp?: string | number;
}

/** Derived W3C trace context for one journey event. */
export interface JourneySpanContext {
  /** 32 lowercase hex chars (128-bit trace id, W3C shape). */
  traceId: string;
  /** 16 lowercase hex chars (64-bit span id, W3C shape). */
  spanId: string;
  /** 2 hex chars. Always {@link TRACE_FLAGS_SAMPLED} here. */
  traceFlags: string;
  /** Full header value: `00-{traceId}-{spanId}-{traceFlags}`. */
  traceparent: string;
}

/**
 * Inbound propagation sources accepted by {@link extractTraceparent}: a
 * plain header record OR a fetch-style Headers-like object exposing
 * `get(name)` (both case-insensitive).
 */
export type TraceparentSource =
  | Record<string, string>
  | { get(name: string): string | null };

/** Non-cryptographic 32-bit FNV-1a. Correlation use ONLY. */
function fnv1a(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Derive `words` independent 32-bit words from one seed by chaining each
 * word's output into the next seed. Chained re-seeding avoids adjacent-word
 * structure inside a single hash output.
 */
function hashWords(seed: string, words: number): string {
  let out = '';
  let chain = fnv1a(seed, FNV_OFFSET_BASIS);
  for (let i = 0; i < words; i++) {
    out += chain.toString(16).padStart(8, '0');
    chain = fnv1a(`${seed}#${i}`, chain);
  }
  return out;
}

/** Guard against the W3C all-zero invalidity (vanishingly rare, but cheap). */
function dezero(id: string): string {
  return ALL_ZERO_RE.test(id) ? `${id.slice(0, -1)}1` : id;
}

function requireEventId(id: unknown): string {
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      'clicktrail/otel: journeySpanContext needs a non-empty string event id.',
    );
  }
  return id;
}

/**
 * Derive the W3C trace context for a journey event. Deterministic pure
 * function: identical inputs yield byte-identical outputs forever. Throws
 * fail-closed on a missing/empty event id (an uncorrelated event is worse
 * than a loud instrumentation bug).
 *
 * Ids are CORRELATION ids (see module notice) — not cryptographic secrets.
 */
export function journeySpanContext(event: JourneyEventRef): JourneySpanContext {
  const id = requireEventId(event.id);
  const ts =
    event.timestamp === undefined || event.timestamp === null
      ? ''
      : typeof event.timestamp === 'number'
        ? String(Math.floor(event.timestamp))
        : event.timestamp;
  const seed = `${TRACEPARENT_VERSION}|${id}|${ts}`;
  const traceId = dezero(hashWords(`${seed}|trace`, 4));
  const spanId = dezero(hashWords(`${seed}|span`, 2));
  const traceFlags = TRACE_FLAGS_SAMPLED;
  return {
    traceId,
    spanId,
    traceFlags,
    traceparent: `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${traceFlags}`,
  };
}

/**
 * Pick the best stable identity from a flat stamped event payload
 * (ClickTrail wire shape). Prefers explicit journey-level ids (message,
 * agent run); falls back to the event name. Callers needing tighter
 * uniqueness should compose their own id before calling
 * {@link journeySpanContext}.
 */
export function defaultEventId(event: Record<string, unknown>): string {
  const messageId = event[ATTR_MESSAGE_ID];
  if (typeof messageId === 'string' && messageId !== '') return messageId;
  const runId = event[ATTR_AGENT_RUN_ID];
  if (typeof runId === 'string' && runId !== '') return runId;
  return String(event['event_name'] ?? '');
}

/**
 * First present timestamp field on a stamped payload, preferring canonical
 * `occurred_at`, then adapter `event_time`, then legacy `timestamp`.
 */
export function defaultEventTimestamp(
  event: Record<string, unknown>,
): string | number | undefined {
  for (const key of ['occurred_at', 'event_time', 'timestamp']) {
    const v = event[key];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return v;
  }
  return undefined;
}

function readHeader(source: TraceparentSource, name: string): string | null {
  if (typeof (source as { get?: unknown }).get === 'function') {
    const getter = source as { get(n: string): string | null };
    return (
      getter.get(name) ??
      getter.get(name.toLowerCase()) ??
      getter.get(name.toUpperCase())
    );
  }
  const record = source as Record<string, string>;
  const direct = record[name];
  if (direct !== undefined) return direct;
  const upper = name.toUpperCase();
  for (const key of Object.keys(record)) {
    if (key.toUpperCase() === upper) return record[key]!;
  }
  return null;
}

/**
 * Parse an inbound `traceparent` header into its components. STRICT: only
 * version `00`, well-formed hex component lengths, and non-all-zero ids are
 * accepted; anything else returns `null` (propagation is best-effort — an
 * unparsable header must never break delivery).
 */
export function extractTraceparent(
  source: TraceparentSource,
): JourneySpanContext | null {
  const raw = readHeader(source, 'traceparent');
  if (typeof raw !== 'string') return null;
  const m = TRACEPATTERN_RE.exec(raw.trim().toLowerCase());
  if (!m) return null;
  const version = m[1]!;
  const traceId = m[2]!;
  const spanId = m[3]!;
  const traceFlags = m[4]!;
  if (version !== TRACEPARENT_VERSION) return null;
  if (ALL_ZERO_RE.test(traceId) || ALL_ZERO_RE.test(spanId)) return null;
  return {
    traceId,
    spanId,
    traceFlags,
    traceparent: raw.trim().toLowerCase(),
  };
}
