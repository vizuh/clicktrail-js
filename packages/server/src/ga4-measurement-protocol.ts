/**
 * GA4 Measurement Protocol builder for confirmed payments and refunds.
 *
 * Pure and network-free: no clock, no secrets, no transport. The host supplies
 * every time value, stores the attribution snapshot it captured at checkout
 * start, and POSTs the returned payload itself. The builder either returns a
 * payload that joins the original browser session or explains why sending
 * would produce an unattributed event.
 */
import { parseGaClientIdValue } from '@vizuh/clicktrail-core';

/** GA4 events this builder shapes. */
export type Ga4MeasurementProtocolEventName = 'purchase' | 'refund';

/** Consent value as stored by the host CMP/Consent Mode bridge. */
export type Ga4ConsentChoice = 'granted' | 'denied';

/** The user's stored Consent Mode choice for the two ads signals GA4 MP accepts. */
export interface Ga4StoredConsent {
  ad_user_data: Ga4ConsentChoice;
  ad_personalization: Ga4ConsentChoice;
}

/** GA4 ecommerce item. Only these keys are copied into the payload. */
export interface Ga4MeasurementProtocolItem {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
}

interface Ga4MeasurementProtocolBaseInput {
  /**
   * Flat attribution snapshot the host stored at checkout start (for example
   * `identity.payload` from `parseIdentityFromCookies`). The builder reads
   * `ga_client_id` and `ga_session_id` only.
   */
  snapshot: Readonly<Record<string, string | undefined>>;
  /**
   * Canonical transaction ID shared by browser `begin_checkout`, this event,
   * refunds and ad-platform uploads (for Stripe Checkout: the Checkout Session ID).
   */
  transactionId: string;
  value: number;
  /** ISO 4217 code, e.g. `BRL`. */
  currency: string;
  items?: readonly Ga4MeasurementProtocolItem[];
  /** The user's stored ads consent choice. Required: never hard-code it. */
  consent: Ga4StoredConsent;
  /** Send time, ISO-8601, from the caller's clock. Used for the 72 h limit. */
  now: string;
}

export interface Ga4MeasurementProtocolPurchaseInput extends Ga4MeasurementProtocolBaseInput {
  event: 'purchase';
  /** ISO-8601 time of the last known session activity (checkout start). */
  checkoutStartedAt: string;
  /** ISO-8601 time the payment was confirmed. */
  paidAt: string;
  /** GA4 property session timeout in minutes (5-475). Default 30. */
  sessionTimeoutMinutes?: number;
  /**
   * Explicit choice to build a purchase without `session_id` when the snapshot
   * has none. GA4 then opens a new session with no source. Default false: skip.
   */
  allowMissingSession?: boolean;
}

export interface Ga4MeasurementProtocolRefundInput extends Ga4MeasurementProtocolBaseInput {
  event: 'refund';
  /** ISO-8601 time the refund happened. */
  refundedAt: string;
}

export type Ga4MeasurementProtocolInput =
  | Ga4MeasurementProtocolPurchaseInput
  | Ga4MeasurementProtocolRefundInput;

export interface Ga4MeasurementProtocolEventParams {
  transaction_id: string;
  value: number;
  currency: string;
  engagement_time_msec: number;
  session_id?: number;
  items?: Ga4MeasurementProtocolItem[];
}

export interface Ga4MeasurementProtocolPayload {
  client_id: string;
  timestamp_micros: number;
  consent: {
    ad_user_data: 'GRANTED' | 'DENIED';
    ad_personalization: 'GRANTED' | 'DENIED';
  };
  events: [{ name: Ga4MeasurementProtocolEventName; params: Ga4MeasurementProtocolEventParams }];
}

/** Why the builder declined to produce a payload. */
export type Ga4MeasurementProtocolSkipReason =
  | 'missing_client_id'
  | 'invalid_client_id'
  | 'missing_session_id'
  | 'invalid_session_id'
  | 'paid_before_checkout'
  | 'too_late';

/**
 * Which time `timestamp_micros` carries:
 * - `event_time`: `paidAt` (purchase) or `refundedAt` (refund);
 * - `checkout_start_plus_1s`: late confirmation moved back into the session.
 */
export type Ga4MeasurementProtocolTimestampSource = 'event_time' | 'checkout_start_plus_1s';

export type Ga4MeasurementProtocolResult =
  | { payload: Ga4MeasurementProtocolPayload; timestampSource: Ga4MeasurementProtocolTimestampSource }
  | { skip: Ga4MeasurementProtocolSkipReason };

/** GA4 accepts `timestamp_micros` up to 72 hours in the past. */
export const GA4_MP_MAX_BACKDATE_MS = 72 * 60 * 60 * 1000;
/** GA4 default session timeout. */
export const GA4_DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
/** Offset added to checkout start when a late confirmation is moved into the session. */
export const GA4_LATE_CONFIRMATION_OFFSET_MS = 1000;

const GA_CLIENT_ID_PATTERN = /^\d+\.\d+$/;
const GA_SESSION_ID_PATTERN = /^\d+$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
/** GA4 truncates event parameter values above 100 characters. */
const MAX_PARAM_LENGTH = 100;

function fail(message: string): never {
  throw new TypeError(`clicktrail server: ${message}`);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string.`);
  return value.trim();
}

function requireTime(value: unknown, field: string): number {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ms)) fail(`${field} must be an ISO-8601 timestamp.`);
  return ms;
}

function requireAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${field} must be a finite number >= 0.`);
  }
  return value;
}

function consentFlag(value: unknown, field: string): 'GRANTED' | 'DENIED' {
  if (value === 'granted') return 'GRANTED';
  if (value === 'denied') return 'DENIED';
  return fail(`consent.${field} must be 'granted' or 'denied' from the stored choice.`);
}

function copyItems(items: readonly Ga4MeasurementProtocolItem[]): Ga4MeasurementProtocolItem[] {
  return items.map((item, index) => {
    const out: Ga4MeasurementProtocolItem = {};
    for (const key of ['item_id', 'item_name', 'item_brand', 'item_category', 'item_variant'] as const) {
      const value = item[key];
      if (value === undefined) continue;
      out[key] = requireText(value, `items[${index}].${key}`);
    }
    if (out.item_id === undefined && out.item_name === undefined) {
      fail(`items[${index}] needs item_id or item_name.`);
    }
    if (item.price !== undefined) out.price = requireAmount(item.price, `items[${index}].price`);
    if (item.quantity !== undefined) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        fail(`items[${index}].quantity must be a positive integer.`);
      }
      out.quantity = item.quantity;
    }
    return out;
  });
}

/**
 * Build a GA4 Measurement Protocol `purchase` or `refund` that joins the
 * browser session captured at checkout start.
 *
 * Rules: `client_id` comes only from the snapshot; a purchase carries the
 * numeric `session_id`; a confirmation later than the session timeout is
 * stamped at checkout start + 1 s; events older than 72 h are skipped;
 * `engagement_time_msec` is 1; consent mirrors the stored choice.
 *
 * Malformed caller input throws `TypeError`. Data conditions that would make
 * GA4 drop or misattribute the event return `{ skip }`.
 */
export function buildGa4MeasurementProtocolEvent(
  input: Ga4MeasurementProtocolInput,
): Ga4MeasurementProtocolResult {
  const transactionId = requireText(input.transactionId, 'transactionId');
  if (transactionId.length > MAX_PARAM_LENGTH) {
    fail(`transactionId must be at most ${MAX_PARAM_LENGTH} characters.`);
  }
  const value = requireAmount(input.value, 'value');
  const currency = requireText(input.currency, 'currency').toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) fail('currency must be an ISO 4217 code.');
  const items = input.items === undefined ? undefined : copyItems(input.items);
  if (input.consent === null || typeof input.consent !== 'object') {
    fail('consent must be the stored { ad_user_data, ad_personalization } choice.');
  }
  const consent = {
    ad_user_data: consentFlag(input.consent.ad_user_data, 'ad_user_data'),
    ad_personalization: consentFlag(input.consent.ad_personalization, 'ad_personalization'),
  };
  const nowMs = requireTime(input.now, 'now');

  let eventMs: number;
  let timestampSource: Ga4MeasurementProtocolTimestampSource = 'event_time';
  let sessionId: number | undefined;

  if (input.event === 'purchase') {
    const checkoutMs = requireTime(input.checkoutStartedAt, 'checkoutStartedAt');
    const paidMs = requireTime(input.paidAt, 'paidAt');
    const timeoutMinutes = input.sessionTimeoutMinutes ?? GA4_DEFAULT_SESSION_TIMEOUT_MINUTES;
    if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 5 || timeoutMinutes > 475) {
      fail('sessionTimeoutMinutes must be an integer between 5 and 475.');
    }
    if (paidMs < checkoutMs) return { skip: 'paid_before_checkout' };
    eventMs = paidMs;
    if (paidMs - checkoutMs > timeoutMinutes * 60_000) {
      eventMs = checkoutMs + GA4_LATE_CONFIRMATION_OFFSET_MS;
      timestampSource = 'checkout_start_plus_1s';
    }
  } else if (input.event === 'refund') {
    eventMs = requireTime(input.refundedAt, 'refundedAt');
  } else {
    return fail(`event must be 'purchase' or 'refund'.`);
  }

  const rawClientId = input.snapshot?.['ga_client_id']?.trim();
  if (!rawClientId) return { skip: 'missing_client_id' };
  // ClickTrail stores the reduced `<random>.<timestamp>` form; a raw `_ga`
  // cookie value (`GA1.1.<random>.<timestamp>`) is reduced the same way.
  const clientId = GA_CLIENT_ID_PATTERN.test(rawClientId)
    ? rawClientId
    : parseGaClientIdValue(rawClientId);
  if (!clientId) return { skip: 'invalid_client_id' };

  if (input.event === 'purchase') {
    const rawSessionId = input.snapshot['ga_session_id']?.trim();
    if (rawSessionId) {
      const parsed = Number(rawSessionId);
      if (!GA_SESSION_ID_PATTERN.test(rawSessionId) || !Number.isSafeInteger(parsed) || parsed <= 0) {
        return { skip: 'invalid_session_id' };
      }
      sessionId = parsed;
    } else if (input.allowMissingSession === true) {
      // Explicit choice: no session to land in, so keep the payment time.
      eventMs = requireTime(input.paidAt, 'paidAt');
      timestampSource = 'event_time';
    } else {
      return { skip: 'missing_session_id' };
    }
  }

  if (nowMs - eventMs > GA4_MP_MAX_BACKDATE_MS) return { skip: 'too_late' };

  const params: Ga4MeasurementProtocolEventParams = {
    transaction_id: transactionId,
    value,
    currency,
    engagement_time_msec: 1,
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
    ...(items !== undefined ? { items } : {}),
  };

  return {
    payload: {
      client_id: clientId,
      timestamp_micros: Math.trunc(eventMs) * 1000,
      consent,
      events: [{ name: input.event, params }],
    },
    timestampSource,
  };
}
