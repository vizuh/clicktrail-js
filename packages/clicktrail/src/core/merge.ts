import { CLASSIFIER_VERSION, SCHEMA_VERSION } from '../conventions/stable.js';
import { BROWSER_ID_KEYS, CLICK_ID_KEYS, touchKeys } from './knowledge.js';
import { sanitizeField } from './sanitize.js';
import type { AttributionPayload, ParsedTouch } from './types.js';

const FT = touchKeys('ft');
const LT = touchKeys('lt');

/** Create an empty canonical payload with every contract key present as ''. */
export function emptyAttribution(): AttributionPayload {
  const payload: AttributionPayload = {};
  for (const key of Object.values(FT)) payload[key] = '';
  for (const key of Object.values(LT)) payload[key] = '';
  for (const key of CLICK_ID_KEYS) payload[key] = '';
  for (const key of BROWSER_ID_KEYS) payload[key] = '';
  return payload;
}

/**
 * Merge a parsed touch into a stored canonical payload.
 *
 * Contract (property-tested):
 * - FIRST touch is write-once: existing non-empty ft_ values are never
 *   overwritten. The emptiness guard counts ft_<clickid> keys too
 *   (ruling #17): a bare-gclid first landing IS a first touch.
 * - LAST touch always overwrites lt_ values when a valid touch arrives.
 * - Click IDs overwrite with the newest non-empty value.
 * - The input is never mutated; a new object is returned.
 */
export function mergeAttributionTouch(
  stored: AttributionPayload,
  touch: ParsedTouch,
): AttributionPayload {
  const next: AttributionPayload = { ...stored };

  // First touch: write-once. A stored click ID alone blocks the overwrite.
  const ftEmpty =
    !next[FT.source] && !next[FT.medium] && !next[FT.campaign] &&
    !next[FT.referrer] && !next[FT.landingPage] &&
    CLICK_ID_KEYS.every((key) => !next[`ft_${key}`]);
  if (ftEmpty) {
    next[FT.source] = touch.source;
    next[FT.medium] = touch.medium;
    next[FT.campaign] = touch.campaign;
    next[FT.term] = touch.term;
    next[FT.content] = touch.content;
    next[FT.utmId] = touch.utmId;
    next[FT.utmSourcePlatform] = touch.utmSourcePlatform;
    next[FT.utmCreativeFormat] = touch.utmCreativeFormat;
    next[FT.utmMarketingTactic] = touch.utmMarketingTactic;
    next[FT.channel] = touch.channelLabel;
    next[FT.referrer] = touch.referrer;
    next[FT.landingPage] = touch.landingPage;
    next[FT.touchTimestamp] = touch.touchTimestamp;
  }

  // Last touch: overwrite on every valid signal.
  next[LT.source] = touch.source;
  next[LT.medium] = touch.medium;
  next[LT.campaign] = touch.campaign;
  next[LT.term] = touch.term;
  next[LT.content] = touch.content;
  next[LT.utmId] = touch.utmId;
  next[LT.utmSourcePlatform] = touch.utmSourcePlatform;
  next[LT.utmCreativeFormat] = touch.utmCreativeFormat;
  next[LT.utmMarketingTactic] = touch.utmMarketingTactic;
  next[LT.channel] = touch.channelLabel;
  next[LT.referrer] = touch.referrer;
  next[LT.landingPage] = touch.landingPage;
  next[LT.touchTimestamp] = touch.touchTimestamp;

  // Click IDs: newest non-empty wins (from the touch itself; deterministic order).
  for (const key of CLICK_ID_KEYS) {
    const value = touch.clickIds?.[key];
    if (value) next[key] = value;
  }

  return next;
}

/**
 * Extract click IDs from a URL into canonical payload keys.
 * `sc_click_id` folds into `sccid`. Keys are matched case-insensitively and
 * the LAST occurrence of a duplicate parameter wins (rulings #9/#11).
 */
export function extractClickIds(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    // Collect lowercased keys with last-occurrence-wins semantics.
    const flat = new Map<string, string>();
    for (const [rawKey, rawValue] of new URL(url).searchParams.entries()) {
      flat.set(rawKey.toLowerCase(), rawValue);
    }
    for (const [key, value] of flat) {
      const canonical = key === 'sc_click_id' ? 'sccid' : key;
      if ((CLICK_ID_KEYS as readonly string[]).includes(canonical) && value) {
        out[canonical] = sanitizeField(value);
      }
    }
  } catch {
    // Unparseable URL: no click IDs. Deterministic empty result.
  }
  return out;
}

/** Attach schema/classifier version stamps to any outgoing event payload. */
export function stampVersions<T extends object>(payload: T): T & {
  schema_version: string; classifier_version: string;
} {
  return {
    ...payload,
    schema_version: SCHEMA_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
}
