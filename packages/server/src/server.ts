/**
 * @vizuh/clicktrail-server — canonical server-side conversion client.
 *
 * Single home for the ClickTrailServer contract previously duplicated across
 * integration packages (astro, nuxt). Validation contracts are identical:
 * money fields positive + finite + non-empty currency string; async methods
 * reject as promises; send() resolves { ok, status } and NEVER throws into
 * host request handling (an analytics outage must never break checkout).
 */
import { withDeliveryTimeout } from '@vizuh/clicktrail-browser';
import {
  buildEventPayload,
  parseCookieMap,
  sanitizeServerEventInput,
  filterServerAttributionPayload,
} from '@vizuh/clicktrail-browser';
import type { ClickTrailEvent } from '@vizuh/clicktrail-browser';
import type { AttributionPayload, RandomBytesFn } from '@vizuh/clicktrail-core';
import {
  deriveStableEventId,
  isSafeHttpUrl,
  mintEventId,
  toCanonicalEventName,
} from '@vizuh/clicktrail-core';
import {
  ATTRIBUTION_KEY,
  LEGACY_ATTRIBUTION_KEY,
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '@vizuh/clicktrail-browser';

export interface ServerIdentity {
  /** Canonical flat attribution payload from the first-party cookie. */
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
      ? filterServerAttributionPayload(safeJsonParse(payloadRaw))
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

export interface ClickTrailServerConfig {
  /** Collector URL receiving `{ events: [...] }` batches. Required. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  fetch?: typeof fetch;
  /**
   * Random byte source for event ids minted when a conversion has no
   * eventId, business key, or explicit `now`. Defaults to WebCrypto
   * (`globalThis.crypto`, else `node:crypto`). Never Math.random.
   */
  randomBytes?: RandomBytesFn;
}

export interface ConversionInput<D extends Record<string, unknown>> {
  identity: ServerIdentity;
  data?: D;
  /**
   * ISO-8601 occurrence time override. Defaults to the current wall clock.
   * When set, it also keys a stable derived `event_id` (same input, same id).
   */
  now?: string;
  /** Stable caller-owned key reused when the same logical event is retried. */
  eventId?: string;
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
  /** Optional canonical alias; takes precedence over transactionId when set. */
  orderId?: string;
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

function normalizeEventId(value: unknown): string {
  const eventId = requireNonEmptyString(value, 'eventId');
  return eventId.startsWith('evt_') ? eventId : `evt_${eventId}`;
}

function stableConversionKey(
  eventName: string,
  input: ConversionInput<Record<string, unknown>>,
): string {
  const data = input.data ?? {};
  const businessKey = BUSINESS_KEY_FIELDS.map((key) => data[key]).find(isBusinessKeyValue);
  const stableInput = input.eventId
    ?? businessKey
    ?? data['formId']
    ?? data['form_id']
    ?? `${input.identity.visitorId ?? ''}:${input.identity.sessionId ?? ''}`;
  return JSON.stringify([
    eventName,
    String(stableInput),
    input.identity.visitorId ?? '',
    input.identity.sessionId ?? '',
    input.now ?? '',
  ]);
}

/** Caller-owned keys that identify one logical conversion across retries. */
const BUSINESS_KEY_FIELDS = [
  'transactionId',
  'transaction_id',
  'bookingId',
  'booking_id',
  'leadId',
  'lead_id',
  'orderId',
  'order_id',
] as const;

/** Empty, whitespace, and non-scalar values do not identify a conversion. */
function isBusinessKeyValue(value: unknown): boolean {
  return (typeof value === 'string' && value.trim() !== '')
    || (typeof value === 'number' && Number.isFinite(value));
}

function hasBusinessKey(data: Record<string, unknown>): boolean {
  return BUSINESS_KEY_FIELDS.some((key) => isBusinessKeyValue(data[key]));
}

type WebCryptoLike = Pick<Crypto, 'getRandomValues'>;

function globalWebCrypto(): WebCryptoLike | undefined {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  return webCrypto?.getRandomValues ? webCrypto : undefined;
}

function loadNodeWebCrypto(): Promise<WebCryptoLike | undefined> {
  return import('node:crypto').then((m) => m.webcrypto as WebCryptoLike, () => undefined);
}

// ponytail: Node 18 has no global WebCrypto. Start loading node:crypto at
// module load so the first track* call does not wait on it (and delivery
// timing stays the same as Node 20+). Runtimes with globalThis.crypto never
// touch the Node builtin. The promise never rejects.
const preloadedNodeWebCrypto = globalWebCrypto() ? undefined : loadNodeWebCrypto();

async function defaultRandomBytes(): Promise<RandomBytesFn> {
  const webCrypto = globalWebCrypto() ?? await (preloadedNodeWebCrypto ?? loadNodeWebCrypto());
  if (!webCrypto) {
    throw new TypeError('clicktrail server: no WebCrypto available; pass config.randomBytes.');
  }
  return (byteLength) => webCrypto.getRandomValues(new Uint8Array(byteLength));
}

async function resolveEventId(
  eventName: string,
  input: ConversionInput<Record<string, unknown>>,
  siteId: string | undefined,
  randomBytes: RandomBytesFn | undefined,
): Promise<string> {
  if (input.eventId !== undefined) return normalizeEventId(input.eventId);
  // Derive a stable id only from caller-owned occurrence data, so retries of
  // the same conversion deduplicate. formId and visitor/session identity are
  // shared by many distinct conversions and must never be the only key.
  if (input.now !== undefined || hasBusinessKey(input.data ?? {})) {
    return deriveStableEventId(siteId ?? 'clicktrail', stableConversionKey(eventName, input));
  }
  return mintEventId(randomBytes ?? await defaultRandomBytes());
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const CONVERSION_RESERVED_KEYS = [
  'lead_id',
  'booking_id',
  'order_id',
  'form_id',
  'event_time',
  'occurred_at',
  'formId',
  'leadId',
  'bookingId',
  'transactionId',
  'orderId',
  'startDate',
] as const;

const SAFE_CONVERSION_DATA_KEYS = new Set([
  'value',
  'currency',
  'landing_url',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'consent',
  'consent_state',
  'consent_source',
  'consent_version',
  'form_provider',
  'properties',
]);

function sanitizeConversionData(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeServerEventInput(input);
  for (const key of CONVERSION_RESERVED_KEYS) delete sanitized[key];
  return Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => SAFE_CONVERSION_DATA_KEYS.has(key)),
  );
}

function requireSafeHttpUrl(value: unknown, field: string): string {
  const endpoint = requireNonEmptyString(value, field);
  if (!isSafeHttpUrl(endpoint)) {
    throw new TypeError(`clicktrail server: ${field} must be a public absolute https URL.`);
  }
  return endpoint;
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
  private readonly randomBytes?: RandomBytesFn;

  constructor(config: ClickTrailServerConfig) {
    this.endpoint = requireSafeHttpUrl(config.endpoint, 'endpoint');
    this.fetchImpl = config.fetch ?? fetch;
    if (config.randomBytes !== undefined) this.randomBytes = config.randomBytes;
    if (config.siteId !== undefined) this.siteId = config.siteId;
    if (config.workspaceId !== undefined) this.workspaceId = config.workspaceId;
  }

  async send(events: readonly ClickTrailEvent[]): Promise<SendResult> {
    try {
      const response = await withDeliveryTimeout((signal) => this.fetchImpl(this.endpoint, {
        signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [...events] }),
        redirect: 'error',
      }));
      return { ok: response.ok, status: response.status };
    } catch {
      // At-most-once delivery contract: analytics failures never break hosts.
      return { ok: false, status: 0 };
    }
  }

  private async build(
    eventName: string,
    input: ConversionInput<Record<string, unknown>>,
  ): Promise<ClickTrailEvent> {
    const payload = filterServerAttributionPayload(input.identity.payload ?? {});
    const inputData = input.data ?? {};
    const data = sanitizeConversionData(inputData);
    const canonicalName = toCanonicalEventName(eventName);
    const occurredAt = input.now === undefined
      ? new Date().toISOString()
      : requireNonEmptyString(input.now, 'now');
    const formId = optionalText(inputData['formId']);
    const leadId = optionalText(inputData['leadId']);
    const bookingId = optionalText(inputData['bookingId']);
    const orderId = optionalText(inputData['orderId']) ?? optionalText(inputData['transactionId']);
    const startDate = optionalText(inputData['startDate']);
    const eventId = await resolveEventId(eventName, input, this.siteId, this.randomBytes);
    return buildEventPayload(payload, canonicalName, {
      ...data,
      ...(formId !== undefined ? { form_id: formId } : {}),
      ...(leadId !== undefined ? { lead_id: leadId } : {}),
      ...(bookingId !== undefined ? { booking_id: bookingId } : {}),
      ...(orderId !== undefined ? { order_id: orderId } : {}),
      ...(startDate !== undefined ? { start_date: startDate } : {}),
      event_id: eventId,
      occurred_at: occurredAt,
      ...(this.siteId !== undefined ? { site_id: this.siteId } : {}),
      ...(this.workspaceId !== undefined ? { workspace_id: this.workspaceId } : {}),
      ...(input.identity.visitorId ? { visitor_id: input.identity.visitorId } : {}),
      ...(input.identity.sessionId ? { session_id: input.identity.sessionId } : {}),
      ...(input.identity.sessionNumber !== undefined
        ? { session_number: String(input.identity.sessionNumber) }
        : {}),
    }, {
      ...(this.siteId !== undefined ? { siteId: this.siteId } : {}),
      ...(this.workspaceId !== undefined ? { workspaceId: this.workspaceId } : {}),
      ...(input.identity.visitorId ? { identity: { visitorId: input.identity.visitorId } } : {}),
    });
  }

  /**
   * Send a `lead` conversion.
   *
   * Retries are idempotent only when the call carries `eventId` or a business
   * key (`data.leadId`, or an explicit `now`): repeating the same input then
   * yields the same `event_id`. Without one, every call mints a random
   * `event_id`, so a retried call counts as a new conversion. `formId` and
   * visitor/session identity are not business keys.
   */
  async trackLead(input: ConversionInput<LeadData>): Promise<SendResult> {
    return this.send([await this.build('lead', input)]);
  }

  /**
   * Send a `booking` conversion.
   *
   * Retries are idempotent only with `eventId` or a business key
   * (`data.bookingId`, or an explicit `now`); otherwise each call mints a
   * random `event_id`.
   */
  async trackBooking(input: ConversionInput<BookingData>): Promise<SendResult> {
    const value = input.data?.value;
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
      throw new TypeError('clicktrail server: booking.value must be a positive finite number.');
    }
    return this.send([await this.build('booking', input)]);
  }

  /**
   * Send a `sale` conversion. The required `data.transactionId` is the
   * business key, so retries of the same purchase reuse the same `event_id`
   * (an explicit `eventId` still wins).
   */
  async trackPurchase(input: ConversionInput<PurchaseData>): Promise<SendResult> {
    requireNonEmptyString(input.data?.transactionId, 'purchase.transactionId');
    requirePositiveNumber(input.data?.value, 'purchase.value');
    requireNonEmptyString(input.data?.currency, 'purchase.currency');
    return this.send([await this.build('sale', input)]);
  }
}
