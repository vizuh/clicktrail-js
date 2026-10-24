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
 * - ga_session_id / ga_session_number <- parsed from the configured
 *   property's `_ga_<ID>` cookie, or the first usable `_ga_*` cookie when
 *   no measurement ID is configured            (:848-887, :884-897)
 *
 * Deliberate deviations from the plugin (issue #47): the measurement-ID pin,
 * GS2 tokens read after the `GS2.<n>.` prefix, and no numeric-token fallback
 * for non-GS1/GS2 values. A wrong session ID splits the GA4 session; a
 * missing one does not.
 *
 * Duplicate cookie names (issue #66): parseCookieMap keeps the last
 * occurrence by default (plugin getCookieMap parity) or the first with
 * `duplicates: 'first'`, which createClickTrail uses for browser IDs.
 */
import { BROWSER_ID_KEYS, DIAGNOSTIC_CODES, parseGaClientIdValue } from '@vizuh/clicktrail-core';
import type { AttributionPayload, DiagnosticSink } from '@vizuh/clicktrail-core';

/** Which occurrence {@link parseCookieMap} keeps when a cookie name repeats. */
export type CookieDuplicatePolicy = 'first' | 'last';

export interface ParseCookieMapOptions {
  /**
   * Which value to keep when a name appears more than once (one cookie per
   * domain or path). Browsers list longer paths first and, for equal paths,
   * older cookies first (RFC 6265 §5.4).
   * - `'last'` (default): plugin getCookieMap parity; matches the cookie
   *   storage adapter, so server reads of ClickTrail's own cookies agree with
   *   the browser.
   * - `'first'`: what `document.cookie.match(...)` readers and gtag's `_ga`
   *   read take. createClickTrail reads browser-ID cookies this way.
   */
  duplicates?: CookieDuplicatePolicy;
  /**
   * Receives `browser_id_cookie_duplicate` (at most once per call) when
   * `_ga`, `_ga_<property>`, `_fbp` or `_fbc` appears more than once with
   * different values. Context carries cookie names, never values.
   */
  sink?: DiagnosticSink;
}

/** Parse a raw document.cookie header into a name->value map (lowercased names). */
export function parseCookieMap(raw: string, options: ParseCookieMapOptions = {}): Record<string, string> {
  const duplicates = options.duplicates ?? 'last';
  if (duplicates !== 'first' && duplicates !== 'last') {
    throw new TypeError(`clicktrail: invalid cookie duplicates policy '${String(duplicates)}'; expected 'first' or 'last'.`);
  }
  const out: Record<string, string> = {};
  if (!raw) return out;
  const conflicting = new Set<string>();
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
    if (Object.prototype.hasOwnProperty.call(out, name)) {
      const tracked = name === '_ga' || name === '_fbp' || name === '_fbc' || name.startsWith('_ga_');
      if (tracked && out[name] !== value) conflicting.add(name);
      if (duplicates === 'first') continue;
    }
    out[name] = value;
  }
  if (conflicting.size > 0) {
    options.sink?.report({
      code: DIAGNOSTIC_CODES.BROWSER_ID_COOKIE_DUPLICATE,
      level: 'warn',
      message: `Browser-ID cookies are set more than once with different values (one per domain or path); the ${duplicates} occurrence is used.`,
      context: { cookie_names: [...conflicting].join(','), duplicates },
    });
  }
  return out;
}

/** GA session IDs are Unix-second timestamps; six digits matches the plugin's GS2 floor. */
const GA_SESSION_ID = /^\d{6,}$/;
const GA_SESSION_NUMBER = /^\d+$/;

/**
 * Extract GA session id/number from a `_ga_<property>` cookie value
 * (port of parseGaSessionData, clicutcl-attribution.js:848-887, minus the
 * numeric-token fallback). Recognized formats:
 * - GS2 `GS2.1.s<id>$o<num>$g…`: `$`-separated tokens after the `GS2.<n>.` prefix.
 * - GS1 `GS1.1.<id>.<num>.…`: dot-separated fields.
 * Anything else yields `{}`. Pure function of the string.
 */
export function parseGaSessionDataValue(rawValue: string): {
  ga_session_id?: string;
  ga_session_number?: string;
} {
  const value = rawValue.trim();
  const out: { ga_session_id?: string; ga_session_number?: string } = {};

  const gs2 = /^GS2\.\d+\.(.*)$/.exec(value);
  if (gs2) {
    for (const token of gs2[1]!.split('$')) {
      const field = token.slice(1);
      if (token[0] === 's' && !out.ga_session_id && GA_SESSION_ID.test(field)) {
        out.ga_session_id = field;
      } else if (token[0] === 'o' && !out.ga_session_number && GA_SESSION_NUMBER.test(field)) {
        out.ga_session_number = field;
      }
    }
    return out;
  }

  if (value.startsWith('GS1.')) {
    const parts = value.split('.');
    const gs1SessionId = parts[2] ?? '';
    const gs1SessionNumber = parts[3] ?? '';
    if (GA_SESSION_ID.test(gs1SessionId)) out.ga_session_id = gs1SessionId;
    if (GA_SESSION_NUMBER.test(gs1SessionNumber)) out.ga_session_number = gs1SessionNumber;
  }
  return out;
}

/** Pins the GA session cookie to one or more GA4 properties. */
export interface CollectBrowserIdsOptions {
  /**
   * GA4 measurement ID(s), e.g. `'G-ABC123'`. When set, `ga_session_id` /
   * `ga_session_number` come only from `_ga_ABC123` (first listed ID with a
   * usable cookie wins); other properties' `_ga_*` cookies are ignored.
   */
  ga4MeasurementId?: string | readonly string[];
  /**
   * Receives `ga_session_property_unpinned` when no measurement ID is set
   * and more than one `_ga_*` cookie is present.
   */
  sink?: DiagnosticSink;
}

const GA4_MEASUREMENT_ID = /^G-([A-Z0-9]+)$/i;

/**
 * Validate GA4 measurement IDs and map them to lowercased `_ga_<suffix>`
 * cookie names (parseCookieMap lowercases names). Throws on an empty list or
 * a value that is not `G-<alphanumeric>`, so a typo cannot silently drop
 * the session ID.
 */
export function gaSessionCookieNames(ga4MeasurementId: string | readonly string[]): string[] {
  const ids = typeof ga4MeasurementId === 'string' ? [ga4MeasurementId] : [...ga4MeasurementId];
  if (ids.length === 0) {
    throw new TypeError('clicktrail: ga4MeasurementId must list at least one GA4 measurement ID.');
  }
  return ids.map((id) => {
    const match = typeof id === 'string' ? GA4_MEASUREMENT_ID.exec(id.trim()) : null;
    if (!match) {
      throw new TypeError(`clicktrail: invalid GA4 measurement ID '${String(id)}'; expected 'G-XXXXXXX'.`);
    }
    return `_ga_${match[1]!.toLowerCase()}`;
  });
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
  options: CollectBrowserIdsOptions = {},
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

  // `_ga` itself is the client-id source, never session data. A session
  // number without its session ID cannot join a GA4 session, so it is skipped.
  const sessionCookies = Object.entries(cookies).filter(([name]) =>
    name.toLowerCase().startsWith('_ga_'),
  );
  let candidates: string[];
  if (options.ga4MeasurementId !== undefined) {
    // Pinned: configured property order, other properties ignored.
    const byName = new Map(sessionCookies.map(([name, value]) => [name.toLowerCase(), value]));
    candidates = gaSessionCookieNames(options.ga4MeasurementId).map((name) => byName.get(name) ?? '');
  } else {
    // Unpinned: first `_ga_*` cookie with a session ID wins (plugin .some()
    // loop, :884-897); flag the ambiguity when several properties write here.
    candidates = sessionCookies.map(([, value]) => value);
    if (sessionCookies.length > 1) {
      options.sink?.report({
        code: DIAGNOSTIC_CODES.GA_SESSION_PROPERTY_UNPINNED,
        level: 'warn',
        message:
          'Several _ga_* cookies found and no ga4MeasurementId configured; ga_session_id may belong to another GA4 property.',
        context: { ga_session_cookie_count: sessionCookies.length },
      });
    }
  }
  for (const value of candidates) {
    const session = parseGaSessionDataValue(value);
    if (!session.ga_session_id) continue;
    out.ga_session_id = session.ga_session_id;
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
