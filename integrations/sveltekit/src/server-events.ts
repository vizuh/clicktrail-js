/**
 * @clicktrail/sveltekit/server — server-side conversion sender.
 *
 * For use in +page.server.ts load functions and form actions:
 * `trackConversion(request, { event: 'lead', leadId })` reads the visitor
 * identity from the request's first-party cookies and delivers one canonical
 * event to a collector endpoint.
 *
 * Validation contracts are identical to @vizuh/clicktrail-server:
 * - money fields positive + finite + non-empty currency string
 * - async methods reject as promises (TypeError on invalid input)
 * - send() resolves { ok, status } and NEVER throws into host request
 *   handling (an analytics outage must never break checkout).
 */
import { buildEventPayload, parseCookieMap } from '@vizuh/clicktrail/browser';
import type { ClickTrailEvent } from '@vizuh/clicktrail/browser';
import type { AttributionPayload } from '@vizuh/clicktrail-core';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';
import {
  ATTRIBUTION_KEY,
  LEGACY_ATTRIBUTION_KEY,
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '@vizuh/clicktrail/browser';

export interface ServerIdentity {
  /** Canonical flat attribution payload from the attribution cookies. */
  payload: AttributionPayload;
  visitorId?: string;
  sessionId?: string;
  sessionNumber?: number;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Parse identity out of a raw Cookie header. Best-effort: corrupt cookies never throw. */
export function parseIdentityFromCookies(cookieHeader: string | null | undefined): ServerIdentity {
  if (!cookieHeader) return { payload: {} };
  const cookies = parseCookieMap(cookieHeader);

  const payloadRaw = cookies[ATTRIBUTION_KEY] ?? cookies[LEGACY_ATTRIBUTION_KEY];
  const payload =
    typeof payloadRaw === 'string' && payloadRaw
      ? ((safeJsonParse(payloadRaw) as AttributionPayload | null) ?? {})
      : {};

  let visitorId: string | undefined;
  let sessionId: string | undefined;
  let sessionNumber: number | undefined;

  const sessionRaw = cookies[SESSION_STATE_KEY];
  if (typeof sessionRaw === 'string' && sessionRaw) {
    const state = safeJsonParse(sessionRaw) as Record<string, unknown> | null;
    if (state && typeof state === 'object') {
      if (typeof state['visitor_id'] === 'string') visitorId = state['visitor_id'];
      if (typeof state['session_id'] === 'string') sessionId = state['session_id'];
      if (typeof state['session_number'] === 'number') sessionNumber = state['session_number'];
    }
  }
  const fbSession = cookies[SESSION_ID_FALLBACK_KEY];
  if (!sessionId && typeof fbSession === 'string' && fbSession) sessionId = fbSession;
  const fbVisitor = cookies[VISITOR_ID_FALLBACK_KEY];
  if (!visitorId && typeof fbVisitor === 'string' && fbVisitor) visitorId = fbVisitor;

  return {
    payload,
    ...(visitorId !== undefined ? { visitorId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(sessionNumber !== undefined ? { sessionNumber } : {}),
  };
}

export interface TrackConversionOptions {
  /** Canonical or legacy event name ('lead', 'booking', 'sale', ...). Required. */
  event: string;
  /** Collector URL receiving `{ events: [...] }` batches. Required. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  leadId?: string;
  orderId?: string;
  bookingId?: string;
  value?: number;
  currency?: string;
  fetch?: typeof fetch;
}

export interface SendResult {
  ok: boolean;
  status: number;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`clicktrail server: ${field} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`clicktrail server: ${field} must be a positive finite number.`);
  }
  return value;
}

/** Structural subset of the standard Request used here. */
export interface ConversionRequestLike {
  headers: { get(name: string): string | null };
}

/**
 * Track one server-side conversion for the requesting visitor.
 *
 * Invalid input rejects (async TypeError). Network failures resolve
 * { ok: false, status: 0 }; upstream non-2xx resolves { ok: false, status }.
 */
export async function trackConversion(
  request: ConversionRequestLike,
  options: TrackConversionOptions,
): Promise<SendResult> {
  const eventName = toCanonicalEventName(requireNonEmptyString(options.event, 'event'));
  if (options.leadId !== undefined) requireNonEmptyString(options.leadId, 'leadId');
  if (options.orderId !== undefined) requireNonEmptyString(options.orderId, 'orderId');
  if (options.bookingId !== undefined) requireNonEmptyString(options.bookingId, 'bookingId');

  const hasValue = options.value !== undefined;
  if (hasValue) {
    requirePositiveNumber(options.value, 'value');
    requireNonEmptyString(options.currency, 'currency');
  }
  // Currency without a value is tolerated but validated when present.
  if (!hasValue && options.currency !== undefined) {
    requireNonEmptyString(options.currency, 'currency');
  }

  requireNonEmptyString(options.endpoint, 'endpoint');

  const identity = parseIdentityFromCookies(request.headers.get('cookie'));

  const built: ClickTrailEvent = buildEventPayload(identity.payload, eventName, {
    ...(options.leadId !== undefined ? { lead_id: options.leadId } : {}),
    ...(options.orderId !== undefined ? { order_id: options.orderId } : {}),
    ...(options.bookingId !== undefined ? { booking_id: options.bookingId } : {}),
    ...(hasValue ? { value: options.value } : {}),
    ...(options.currency !== undefined ? { currency: options.currency } : {}),
    ...(options.siteId !== undefined ? { site_id: options.siteId } : {}),
    ...(options.workspaceId !== undefined ? { workspace_id: options.workspaceId } : {}),
    ...(identity.visitorId ? { visitor_id: identity.visitorId } : {}),
    ...(identity.sessionId ? { session_id: identity.sessionId } : {}),
    ...(identity.sessionNumber !== undefined
      ? { session_number: String(identity.sessionNumber) }
      : {}),
  });

  const fetchImpl = options.fetch ?? fetch;
  try {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [built] }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    // At-most-once delivery contract mirrors httpDestination: never throw
    // into host request handling for an optional analytics call.
    return { ok: false, status: 0 };
  }
}
