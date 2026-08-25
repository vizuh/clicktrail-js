/**
 * @vizuh/clicktrail-qwik/server — server-side conversion senders.
 *
 * Contract mirror of `packages/server` / the Astro and Nuxt integrations:
 * identical validation matrix, `{ ok, status }` result that NEVER throws,
 * canonical payload builder (schema_version stamped), identity from the
 * visitor's own first-party cookies. In Qwik City apps this is the
 * PREFERRED conversion path: route actions run on the server anyway, so
 * sending from there adds zero client JS.
 *
 * Identity resolution order in a Qwik app:
 * 1. `identityFromSharedMap()` — the request-local store written by the
 *    `@vizuh/clicktrail-qwik/qwik-city` middleware (preferred)
 * 2. `parseIdentityFromCookies()` — raw Cookie header fallback
 */
import { buildEventPayload, parseCookieMap } from '@vizuh/clicktrail-browser';
import type { AttributionPayload } from '@vizuh/clicktrail-core';
import type { ClickTrailEvent } from '@vizuh/clicktrail-browser';
import {
  ATTRIBUTION_KEY,
  LEGACY_ATTRIBUTION_KEY,
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '@vizuh/clicktrail-browser';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';

export interface ServerIdentity {
  /** Canonical flat attribution payload from the `attribution` cookie. */
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

/**
 * Parse server identity out of a raw Cookie header. Tolerates missing or
 * corrupt cookies — identity is best-effort; events still send.
 */
export function parseIdentityFromCookies(
  cookieHeader: string | null | undefined,
): ServerIdentity {
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
  const fallbackSession = cookies[SESSION_ID_FALLBACK_KEY];
  if (!sessionId && typeof fallbackSession === 'string' && fallbackSession) {
    sessionId = fallbackSession;
  }
  const fallbackVisitor = cookies[VISITOR_ID_FALLBACK_KEY];
  if (!visitorId && typeof fallbackVisitor === 'string' && fallbackVisitor) {
    visitorId = fallbackVisitor;
  }

  return {
    payload,
    ...(visitorId !== undefined ? { visitorId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(sessionNumber !== undefined ? { sessionNumber } : {}),
  };
}

export interface ClickTrailServerConfig {
  /** Collector URL receiving `{ events: [...] }` batches. Required. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  fetch?: typeof fetch;
}

export interface ConversionInput<D extends Record<string, unknown>> {
  identity: ServerIdentity;
  data?: D;
  /** ISO-8601 event time override. Default: current wall clock. */
  now?: string;
}

export interface LeadData extends Record<string, unknown> {
  formId?: string;
  leadId?: string;
}
export interface BookingData extends Record<string, unknown> {
  bookingId?: string;
  value?: number;
  currency?: string;
  startDate?: string;
}
export interface PurchaseData extends Record<string, unknown> {
  transactionId: string;
  value: number;
  currency: string;
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

export class ClickTrailServer {
  private readonly endpoint: string;
  private readonly siteId?: string;
  private readonly workspaceId?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ClickTrailServerConfig) {
    this.endpoint = requireNonEmptyString(config.endpoint, 'endpoint');
    this.fetchImpl = config.fetch ?? fetch;
    if (config.siteId !== undefined) this.siteId = config.siteId;
    if (config.workspaceId !== undefined) this.workspaceId = config.workspaceId;
  }

  async send(events: readonly ClickTrailEvent[]): Promise<SendResult> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [...events] }),
      });
      return { ok: response.ok, status: response.status };
    } catch {
      // At-most-once delivery contract mirrors httpDestination: never throw
      // into host request handling for an optional analytics call.
      return { ok: false, status: 0 };
    }
  }

  private build(
    eventName: string,
    input: ConversionInput<Record<string, unknown>>,
  ): ClickTrailEvent {
    return buildEventPayload(input.identity.payload ?? {}, toCanonicalEventName(eventName), {
      ...input.data,
      ...(input.now !== undefined ? { event_time: input.now } : {}),
      ...(this.siteId !== undefined ? { site_id: this.siteId } : {}),
      ...(this.workspaceId !== undefined ? { workspace_id: this.workspaceId } : {}),
      ...(input.identity.visitorId ? { visitor_id: input.identity.visitorId } : {}),
      ...(input.identity.sessionId ? { session_id: input.identity.sessionId } : {}),
      ...(input.identity.sessionNumber !== undefined
        ? { session_number: String(input.identity.sessionNumber) }
        : {}),
    });
  }

  async trackLead(input: ConversionInput<LeadData>): Promise<SendResult> {
    return this.send([this.build('lead', input)]);
  }

  async trackBooking(input: ConversionInput<BookingData>): Promise<SendResult> {
    const value = input.data?.value;
    if (
      value !== undefined &&
      (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    ) {
      throw new TypeError('clicktrail server: booking.value must be a positive finite number.');
    }
    return this.send([this.build('booking', input)]);
  }

  async trackPurchase(input: ConversionInput<PurchaseData>): Promise<SendResult> {
    requireNonEmptyString(input.data?.transactionId, 'purchase.transactionId');
    requirePositiveNumber(input.data?.value, 'purchase.value');
    requireNonEmptyString(input.data?.currency, 'purchase.currency');
    return this.send([this.build('purchase', input)]);
  }
}
