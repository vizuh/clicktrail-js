import { CLASSIFIER_VERSION, SCHEMA_VERSION } from '../conventions/stable.js';
import {
  ATTRIBUTION_SELECTED_CLICK_ID_KEY,
  ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY,
  BROWSER_ID_KEYS,
  CLICK_ID_HISTORY_KEY,
  CLICK_ID_HISTORY_LIMIT,
  CLICK_ID_KEYS,
  touchKeys,
} from './knowledge.js';
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
  payload[CLICK_ID_HISTORY_KEY] = '[]';
  payload[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = '';
  payload[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = '';
  return payload;
}

/**
 * D3 audit trail (Hugo gate ruling): append newly captured click IDs to
 * `click_id_history` (capped, oldest dropped first) and record which ID is
 * selected for attribution plus why. Malformed stored history is discarded,
 * never fatal. Empty values never enter history or overwrite a selection.
 */
function applyClickIdSelectionAudit(
  next: AttributionPayload,
  capturedNow: Array<{ k: string; v: string }>,
  timestamp: string,
): void {
  let history: Array<{ k: string; v: string; t: string }> = [];
  try {
    const parsed: unknown = next[CLICK_ID_HISTORY_KEY]
      ? JSON.parse(next[CLICK_ID_HISTORY_KEY])
      : [];
    if (Array.isArray(parsed)) history = parsed as typeof history;
  } catch {
    history = [];
  }

  for (const entry of capturedNow) {
    history.push({ k: entry.k, v: entry.v, t: timestamp });
  }
  if (history.length > CLICK_ID_HISTORY_LIMIT) {
    history = history.slice(history.length - CLICK_ID_HISTORY_LIMIT);
  }
  next[CLICK_ID_HISTORY_KEY] = JSON.stringify(history);

  const newestValid = [...history].reverse().find((e) => typeof e.v === 'string' && e.v !== '');
  if (!newestValid) return;
  const previousSelected = next[ATTRIBUTION_SELECTED_CLICK_ID_KEY];
  if (!previousSelected) {
    next[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = newestValid.v;
    next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = 'newest_valid';
  } else if (previousSelected !== newestValid.v) {
    next[ATTRIBUTION_SELECTED_CLICK_ID_KEY] = newestValid.v;
    next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = 'newest_valid_superseded_previous';
  } else if (capturedNow.length > 0) {
    next[ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY] = 'newest_valid';
  }
}

/**
 * Merge a parsed touch into a stored canonical payload.
 *
 * Contract (property-tested):
 * - FIRST touch is write-once: existing non-empty ft_ values are never
 *   overwritten. The emptiness guard counts ft_<clickid> keys too
 *   (ruling #17): a bare-gclid first landing IS a first touch.
 * - LAST touch always overwrites lt_ values when a valid touch arrives.
 * - Click IDs overwrite with the newest non-empty value. Each captured click
 *   ID is ALSO mirrored into its `ft_<cid>` / `lt_<cid>` touch fields at
 *   write time (RULING B, runtime findings 2026-08-23 — plugin contract,
 *   applyTouch(mapQueryFields), clicutcl-attribution.js:1788-1799 +
 *   :1813-1837). Empty click IDs never overwrite existing mirrors.
 * - Browser IDs from the parsed touch are written top-level, newest
 *   non-empty wins (RULING A part a; plugin mergeTopLevelIdentifiers :1797).
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

    // First-touch write-time click-ID mirror (RULING B): applyTouch('ft')
    // runs only when hasFirstTouch() is false (:1770-1782, :1793-1801), so
    // the ft_<cid> mirrors follow the same write-once gate.
    for (const key of CLICK_ID_KEYS) {
      const value = touch.clickIds?.[key];
      if (value) next[`ft_${key}`] = value;
    }
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

  // Last-touch write-time click-ID mirror (RULING B): applyTouch('lt')
  // always runs on a valid signal, so lt_<cid> follows every capture.
  for (const key of CLICK_ID_KEYS) {
    const value = touch.clickIds?.[key];
    if (value) next[`lt_${key}`] = value;
  }

  // Click IDs: newest-valid-wins (from the touch itself; deterministic order).
  const capturedNow: Array<{ k: string; v: string }> = [];
  for (const key of CLICK_ID_KEYS) {
    const value = touch.clickIds?.[key];
    if (value) {
      next[key] = value;
      capturedNow.push({ k: key, v: value });
    }
  }

  applyClickIdSelectionAudit(next, capturedNow, touch.touchTimestamp);

  // Browser IDs (RULING A part a): newest non-empty wins, same law as
  // click IDs (plugin mergeTopLevelIdentifiers overwrites on any
  // non-empty differing value, :1797-1811).
  for (const key of BROWSER_ID_KEYS) {
    const value = touch.browserIds?.[key];
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
