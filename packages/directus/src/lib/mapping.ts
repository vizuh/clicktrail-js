/**
 * Field-name mapping: Directus item payloads -> canonical AttributionPayload.
 *
 * Pure and tested. The hook calls {@link extractAttributionSignals} on every
 * configured items.create event; URL-shaped input (landing_url + referrer,
 * or bare utm_* / click-id keys) is parsed with the SDK core
 * (parseAttributionUrl -> mergeAttributionTouch) so first/last-touch rules
 * stay identical to every other integration.
 */
import {
  mergeAttributionTouch,
  parseAttributionUrl,
} from '@vizuh/clicktrail';
import type { AttributionPayload } from '@vizuh/clicktrail';

/** Collections the hook listens to by default (overridable via option). */
export const DEFAULT_COLLECTIONS = ['leads', 'bookings', 'orders'] as const;

/** Collection -> contract event name map. Unknown collections return null. */
export const COLLECTION_EVENT_MAP: Readonly<Record<string, string>> = {
  leads: 'lead',
  bookings: 'booking',
  orders: 'sale.recorded',
};

export function eventForCollection(collection: string): string | null {
  return COLLECTION_EVENT_MAP[collection] ?? null;
}

/** Click-ID keys recognized directly on the item payload. */
export const CLICK_ID_FIELDS = [
  'gclid',
  'fbclid',
  'ttclid',
  'msclkid',
  'li_fat_id',
] as const;

/** Visitor/trail identity fields copied top-level into the payload. */
export const IDENTITY_FIELDS = ['visitor_id', 'trail_id', 'session_id'] as const;

/** Raw URL pair fields that, when present, drive a full attribution parse. */
export const URL_FIELDS = ['landing_url', 'referrer'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Signals found on a raw Directus item payload. Every list is sorted for
 * deterministic behavior in tests and logs.
 */
export interface AttributionSignals {
  flatKeys: string[];
  utmParams: Record<string, string>;
  clickIds: Record<string, string>;
  identity: Record<string, string>;
  landingUrl: string;
  referrer: string;
}

/**
 * Extract attribution signals present on an item payload:
 * - flat ft_/lt_ keys are carried verbatim into the canonical payload;
 * - utm_* keys become a synthetic touch;
 * - click ids (gclid/fbclid/ttclid/msclkid/li_fat_id) ride along;
 * - visitor_id/trail_id/session_id are copied top-level;
 * - landing_url/referrer pair drives the full SDK parse when present.
 */
export function extractAttributionSignals(item: Record<string, unknown>): AttributionSignals {
  const signals: AttributionSignals = {
    flatKeys: [],
    utmParams: {},
    clickIds: {},
    identity: {},
    landingUrl: '',
    referrer: '',
  };

  for (const key of Object.keys(item).sort()) {
    const value = text(item[key]);
    if (!value) continue;
    if (key.startsWith('ft_') || key.startsWith('lt_')) {
      signals.flatKeys.push(key);
    } else if (key.startsWith('utm_')) {
      signals.utmParams[key] = value;
    } else if ((CLICK_ID_FIELDS as readonly string[]).includes(key)) {
      signals.clickIds[key] = value;
    } else if ((IDENTITY_FIELDS as readonly string[]).includes(key)) {
      signals.identity[key] = value;
    }
  }

  signals.landingUrl = text(item['landing_url']);
  signals.referrer = text(item['referrer']);
  return signals;
}

/**
 * Build a query string from collected utm params + click ids so the SDK
 * parser can classify the touch exactly like a real landing.
 * Deterministic order (sorted keys).
 */
export function synthesizeLandingUrl(
  utmParams: Record<string, string>,
  clickIds: Record<string, string>,
  landingUrl: string,
): string | null {
  if (landingUrl) return landingUrl;
  const pairs: string[] = [];
  for (const key of Object.keys(utmParams).sort()) pairs.push(`${key}=${encodeURIComponent(utmParams[key] ?? '')}`);
  for (const key of CLICK_ID_FIELDS) {
    const value = clickIds[key];
    if (value) pairs.push(`${key}=${encodeURIComponent(value)}`);
  }
  if (pairs.length === 0) return null;
  return `https://signal.invalid/?${pairs.join('&')}`;
}

/**
 * Canonical payload for a hook event: stored flat ft_/lt_ state merged with
 * any NEW touch parsed from URL/utm/click-id input. New touches overwrite
 * lt_ (last touch wins); ft_ stays write-once via mergeAttributionTouch.
 */
export function buildCanonicalPayload(item: Record<string, unknown>): AttributionPayload {
  const signals = extractAttributionSignals(item);

  // Start from stored flat state (ft_/lt_ keys verbatim).
  let payload: AttributionPayload = {};
  for (const key of signals.flatKeys) payload[key] = text(item[key]);

  const url = synthesizeLandingUrl(signals.utmParams, signals.clickIds, signals.landingUrl);
  if (url !== null && url !== '') {
    const referrer = signals.referrer || undefined;
    const parsed = parseAttributionUrl(referrer !== undefined ? { url, referrer } : { url });
    if (parsed.kind === 'touch') {
      payload = mergeAttributionTouch(payload, parsed.touch);
    }
  }

  for (const key of IDENTITY_FIELDS) {
    const value = signals.identity[key];
    if (value) payload[key] = value;
  }
  return payload;
}

/** True when the item carries ANY attribution signal worth building on. */
export function hasAttributionSignal(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const signals = extractAttributionSignals(item);
  return (
    signals.flatKeys.length > 0 ||
    Object.keys(signals.utmParams).length > 0 ||
    Object.keys(signals.clickIds).length > 0 ||
    signals.landingUrl !== ''
  );
}
