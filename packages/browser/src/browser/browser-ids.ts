/**
 * Cookie-derived browser/platform identifiers — /browser adapter ONLY.
 *
 * RULING (supervisor, runtime findings 2026-08-23, split responsibility):
 * the CORE engine never touches cookies; it collects browser IDs from URL
 * query params only. This module ports the COOKIE-DERIVED half of the
 * plugin's BrowserIdentifiers.collect() (clicutcl-attribution.js:791-907,
 * READ-ONLY evidence) and must be invoked behind the SDK's consent gate.
 *
 * Collected keys (BROWSER_ID_KEYS subset evidence):
 * - fbp   <- `_fbp` | `fbp` cookie            (:859-862)
 * - fbc   <- `_fbc` | `fbc` cookie            (:864-866; fbclid DERIVATION
 *            is core-side because it comes from a query param)
 * - ttp   <- `_ttp` | `ttp` cookie            (:869-872)
 * - li_gc <- `li_gc` cookie                   (:874-877)
 * - ga_client_id <- parsed from `_ga`         (:826-846, :879-882)
 * - ga_session_id / ga_session_number <- parsed from the first usable
 *   `_ga*` cookie                             (:848-887, :884-897)
 */
import { BROWSER_ID_KEYS, parseGaClientIdValue } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';

/** Parse a raw document.cookie header into a name->value map (lowercased names). */
export function parseCookieMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim().toLowerCase();
    if (!name) continue;
    let value = trimmed.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Malformed escape: keep the raw value rather than dropping the entry.
    }
    out[name] = value;
  }
  return out;
}

/**
 * Extract GA session id/number from a `_ga<property>` cookie value
 * (port of parseGaSessionData, clicutcl-attribution.js:848-887):
 * GS2 `$s<id>$o<num>` tokens first, then GS1. dot format, then the first
 * two numeric tokens as a fallback. Pure function of the string.
 */
export function parseGaSessionDataValue(rawValue: string): {
  ga_session_id?: string;
  ga_session_number?: string;
} {
  const value = rawValue.trim();
  if (!value) return {};
  const out: { ga_session_id?: string; ga_session_number?: string } = {};

  const gs2SessionId = value.match(/(?:^|\$)s(\d{6,})(?:\$|$)/);
  const gs2SessionNumber = value.match(/(?:^|\$)o(\d+)(?:\$|$)/);
  const gs2Id = gs2SessionId?.[1];
  const gs2Num = gs2SessionNumber?.[1];
  if (gs2Id) out.ga_session_id = gs2Id;
  if (gs2Num) out.ga_session_number = gs2Num;
  if (out.ga_session_id || out.ga_session_number) return out;

  if (value.startsWith('GS1.')) {
    const parts = value.split('.');
    const gs1SessionId = parts[2];
    const gs1SessionNumber = parts[3];
    if (gs1SessionId) out.ga_session_id = gs1SessionId;
    if (gs1SessionNumber) out.ga_session_number = gs1SessionNumber;
    if (out.ga_session_id || out.ga_session_number) return out;
  }

  const numericTokens = value.match(/\d+/g) ?? [];
  if (numericTokens[0]) out.ga_session_id = numericTokens[0];
  if (numericTokens[1]) out.ga_session_number = numericTokens[1];
  return out;
}

function firstCookie(cookies: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = cookies[name];
    if (value) return value;
  }
  return '';
}

/**
 * Collect cookie-derived browser IDs from a parsed cookie map.
 * Pure: takes the map, never the cookie jar, so callers own the consent
 * decision and tests inject fixed maps. Mirrors the cookie branches of the
 * plugin's BrowserIdentifiers.collect(); param fallbacks are NOT repeated
 * here because core parse already owns the query-param path.
 */
export function collectBrowserIdsFromCookies(
  cookies: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};

  const fbp = firstCookie(cookies, ['_fbp', 'fbp']);
  if (fbp) out.fbp = fbp;

  const fbc = firstCookie(cookies, ['_fbc', 'fbc']);
  if (fbc) out.fbc = fbc;

  const ttp = firstCookie(cookies, ['_ttp', 'ttp']);
  if (ttp) out.ttp = ttp;

  const liGc = cookies.li_gc;
  if (liGc) out.li_gc = liGc;

  const gaClientId = parseGaClientIdValue(firstCookie(cookies, ['_ga']));
  if (gaClientId) out.ga_client_id = gaClientId;

  // First `_ga*` cookie carrying session data wins (plugin .some() loop,
  // :884-897); `_ga` itself is excluded (client-id source, not sessions).
  for (const [name, value] of Object.entries(cookies)) {
    if (name === '_ga' || !name.startsWith('_ga_')) continue;
    const session = parseGaSessionDataValue(value);
    if (!session.ga_session_id && !session.ga_session_number) continue;
    if (session.ga_session_id) out.ga_session_id = session.ga_session_id;
    if (session.ga_session_number) out.ga_session_number = session.ga_session_number;
    break;
  }

  // Param fallbacks (:899-904) are core-side; explicit adapter overrides win.
  if (!out.ga_session_id && cookies.ga_session_id) out.ga_session_id = cookies.ga_session_id;
  if (!out.ga_session_number && cookies.ga_session_number) {
    out.ga_session_number = cookies.ga_session_number;
  }

  // Keep only canonical contract keys.
  const canonical: Record<string, string> = {};
  for (const key of BROWSER_ID_KEYS) {
    const value = out[key];
    if (value) canonical[key] = value;
  }
  return canonical;
}

/**
 * Merge collected browser IDs into a payload top-level, NEWEST NON-EMPTY
 * WINS (plugin mergeTopLevelIdentifiers law, :1797-1811: any non-empty
 * differing value overwrites). Returns the SAME reference when nothing
 * changes so callers can skip persistence cheaply.
 */
export function applyBrowserIdentifiers(
  payload: AttributionPayload,
  ids: Record<string, string>,
): AttributionPayload {
  let changed = false;
  const next: AttributionPayload = { ...payload };
  for (const key of BROWSER_ID_KEYS) {
    const value = ids[key];
    if (!value) continue;
    if (next[key] === value) continue;
    next[key] = value;
    changed = true;
  }
  return changed ? next : payload;
}
