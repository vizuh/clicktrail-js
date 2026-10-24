import type { Channel } from '../conventions/stable.js';
import type {
  AttributionTouch,
  LandingPageFormat,
  ParseAttributionInput,
  ParseResult,
  ParsedTouch,
  ReferrerFormat,
} from './types.js';
import {
  BROWSER_ID_PARAMS,
  CHANNEL_LABELS,
  CLICK_ID_KEYS,
  CLICK_ID_PLATFORMS,
  LANDING_PAGE_QUERY_ALLOWLIST,
  PARAM_ALIASES,
  SEARCH_REFERRER_RULES,
  SOCIAL_REFERRER_RULES,
  UTM_PARAM_TO_FIELD,
  parseGaClientIdValue,
  resolveChannelLabel,
  type ReferrerRule,
  PAID_MEDIUMS,
} from './knowledge.js';
import { areRelatedHosts, hostMatches, isIgnoredReferrerHost, normalizeHost, sanitizeField } from './sanitize.js';

function emptyTouch(now?: string, landingPage = ''): AttributionTouch & { clickIds: Record<string, string> } {
  return {
    source: '', medium: '', campaign: '', term: '', content: '',
    utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
    referrer: '', landingPage, touchTimestamp: now ?? '',
    clickIds: {},
  };
}

function matchesRule(referrerHost: string, rule: ReferrerRule): boolean {
  return rule.domains.some((domain) => hostMatches(referrerHost, domain));
}

/** Canonical source names (ruling #4); explicit suffix rules incl. intl TLDs (ruling #5). */
function classifyReferrerHost(referrerHost: string): { source: string; channel: Channel } {
  for (const rule of SEARCH_REFERRER_RULES) {
    if (matchesRule(referrerHost, rule)) return { source: rule.source, channel: 'organic_search' };
  }
  for (const rule of SOCIAL_REFERRER_RULES) {
    if (matchesRule(referrerHost, rule)) return { source: rule.source, channel: 'organic_social' };
  }
  return { source: referrerHost, channel: 'referral' };
}

/**
 * Extract the host portion of a referrer URL; '' when unparseable/same-page
 * anchor or when the protocol is not http(s) (ruling #8).
 */
export function referrerHostOf(referrer: string): string {
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return normalizeHost(u.host);
  } catch {
    return '';
  }
}

interface QueryValues {
  get(key: string): string | undefined;
  keys(): string[];
}

/**
 * Minimal deterministic query reader over a URL string.
 *
 * Contract (rulings #9/#11/#10):
 * - ALL query keys are lowercased before lookup (mixed-case UTMs work).
 * - The LAST occurrence of a duplicate parameter wins.
 * - '+' decodes as space (URL standard; kept per ruling #10).
 */
export function readQuery(url: string): QueryValues | null {
  try {
    const flat = new Map<string, string>();
    for (const [rawKey, rawValue] of new URL(url).searchParams.entries()) {
      flat.set(rawKey.toLowerCase(), rawValue);
    }
    const sortedKeys = Array.from(flat.keys()).sort();
    return {
      get: (k) => flat.get(k.toLowerCase()),
      keys: () => sortedKeys,
    };
  } catch {
    return null;
  }
}

/**
 * Parse an attribution signal from a landing URL (+ optional external referrer).
 *
 * Rules (contract):
 * - URL campaign parameters or click IDs create a touch directly.
 * - Otherwise an EXTERNAL referrer infers organic_search / organic_social /
 *   referral with CANONICAL source names. Same-site or related-host
 *   referrers create NO new touch (symmetric check, ruling #8).
 * - A referrer on a caller-listed `ignoredReferrerHosts` host (or subdomain),
 *   e.g. a payment return, counts like a same-site one: no referrer touch,
 *   and a URL-parameter touch carries an empty referrer (plugin 1.11.0).
 * - A click ID without UTMs still yields a paid touch via its platform map.
 * - Browser-ID query params (fbc/fbp/ttp/li_gc/ga_*) ride along on the parsed
 *   touch and land top-level at merge time; bare fbclid derives an fbc.
 * - The landing page stores the FULL href including query string (ruling #12)
 *   and the referrer the full URL, unless the caller opts into
 *   `landingPageFormat` / `referrerFormat`. Classification reads raw values.
 * - Opt-in `recordDirectTouch` turns `no_signal` / `internal_referrer` /
 *   `ignored_referrer` into an unmeasured placeholder touch (see
 *   {@link ParsedTouch.unmeasured}).
 * - Opt-in `inferSourceMedium: false` keeps `source` / `medium` as received
 *   from the URL; inferred values then feed only `channel` / `channelLabel`.
 * - Query-parameter values follow the caller's `SanitizeFieldOptions`
 *   (length limit, over-length / macro / control-character policies).
 */
export function parseAttributionUrl(input: ParseAttributionInput): ParseResult {
  const inferSourceMedium = input.inferSourceMedium !== false;
  const now = input.now ? input.now : '';
  const query = readQuery(input.url);
  const landingPage = landingPageOf(
    input.url,
    input.landingPageFormat ?? 'url',
    input.landingPageQueryAllowlist ?? LANDING_PAGE_QUERY_ALLOWLIST,
  );

  // --- collect UTM fields ---
  let hasUtm = false;
  const touch = emptyTouch(now, landingPage);
  if (query) {
    for (const [param, field] of Object.entries(UTM_PARAM_TO_FIELD)) {
      const raw = query.get(param);
      if (raw != null && raw !== '') {
        touch[field] = sanitizeField(raw, input);
        hasUtm = true;
      }
    }
  }

  // --- collect click IDs ---
  const clickIds: Record<string, string> = {};
  if (query) {
    for (const key of query.keys()) {
      const canonical = PARAM_ALIASES[key] ?? key;
      if ((CLICK_ID_KEYS as readonly string[]).includes(canonical)) {
        const value = query.get(key);
        if (value) clickIds[canonical] = sanitizeField(value, input);
      }
    }
  }
  const hasClickId = Object.keys(clickIds).length > 0;

  // --- collect browser IDs present as URL QUERY PARAMS (ruling, runtime
  // findings 2026-08-23): deterministic core-side collection. Plugin
  // evidence: BrowserIdentifiers.collect(params) reads the same params
  // (clicutcl-attribution.js:859-896). Cookie-derived IDs are NOT collected
  // here — the /browser adapter owns them behind the consent gate.
  const browserIds: Record<string, string> = {};
  for (const [param, canonical] of Object.entries(BROWSER_ID_PARAMS)) {
    if (browserIds[canonical]) continue; // plugin preference: bare variant wins over _-prefixed
    const raw = query ? query.get(param) : undefined;
    if (!raw) continue;
    if (canonical === 'ga_client_id') {
      // Plugin validates the GA format even for query-param values (:876).
      const parsed = parseGaClientIdValue(sanitizeField(raw, input));
      if (parsed) browserIds[canonical] = parsed;
    } else {
      browserIds[canonical] = sanitizeField(raw, input);
    }
  }
  // Plugin evidence (:860-866): a bare fbclid derives an fbc when no explicit
  // fbc exists: 'fb.1.' + epochMillis + '.' + fbclid. Deterministic here via
  // the injected `now`; skipped when the clock is absent/unparseable.
  if (!browserIds.fbc && clickIds.fbclid) {
    const nowMs = now ? Date.parse(now) : NaN;
    if (!Number.isNaN(nowMs)) {
      browserIds.fbc = sanitizeField(`fb.1.${nowMs}.${clickIds.fbclid}`, input);
    }
  }

  // Ignored (payment/hosted-checkout) referrers are blanked before either
  // path, like the plugin's resolveTouch (WP plugin 1.11.0).
  const rHost = input.referrer ? referrerHostOf(input.referrer) : '';
  const referrerIgnored =
    rHost !== '' && isIgnoredReferrerHost(rHost, input.ignoredReferrerHosts);
  const referrer = referrerIgnored ? '' : input.referrer ?? '';
  const storedReferrer = referrerOf(referrer, input.referrerFormat ?? 'url');

  if (!hasUtm && !hasClickId) {
    // --- referrer inference path ---
    if (!rHost) {
      return input.recordDirectTouch
        ? { kind: 'touch', touch: unmeasuredTouch(now, landingPage, browserIds, 'direct', inferSourceMedium) }
        : { kind: 'none', reason: 'no_signal' };
    }
    const pageHost = input.currentHost ? normalizeHost(input.currentHost) : '';
    if (pageHost && areRelatedHosts(rHost, pageHost)) {
      return input.recordDirectTouch
        ? { kind: 'touch', touch: unmeasuredTouch(now, landingPage, browserIds, 'before_capture', inferSourceMedium) }
        : { kind: 'none', reason: 'internal_referrer' };
    }
    if (referrerIgnored) {
      // Payment/sign-in return: the visit began before capture one hop
      // earlier. The merge never lets this placeholder replace a stored touch.
      return input.recordDirectTouch
        ? { kind: 'touch', touch: unmeasuredTouch(now, landingPage, browserIds, 'before_capture', inferSourceMedium) }
        : { kind: 'none', reason: 'ignored_referrer' };
    }
    const inferred = classifyReferrerHost(rHost);
    touch.source = sanitizeField(inferred.source);
    touch.medium =
      inferred.channel === 'organic_search' ? 'organic'
      : inferred.channel === 'organic_social' ? 'social'
      : 'referral';
    touch.referrer = storedReferrer;
    const channelLabel = resolveChannelLabel({
      source: touch.source, medium: touch.medium, clickIds: {}, referrer,
    });
    if (!inferSourceMedium) {
      touch.source = '';
      touch.medium = '';
    }
    return {
      kind: 'touch',
      touch: { ...touch, clickIds: {}, browserIds, channel: inferred.channel, channelLabel },
    };
  }

  // --- campaign-parameter path ---
  const receivedSource = touch.source;
  const receivedMedium = touch.medium;
  let channel: Channel;
  if (hasClickId) {
    // Platform map decides; first matching click ID wins (deterministic order).
    const matched = CLICK_ID_KEYS.find((key) => Boolean(clickIds[key]));
    if (matched) {
      const plat = CLICK_ID_PLATFORMS[matched]!;
      if (!touch.source) touch.source = plat.source;
      if (plat.certainty === 'certain') {
        // Advertising-only identifier: paid classification is unambiguous.
        channel = plat.paidChannel ?? 'unknown';
        if (!touch.medium) touch.medium = 'cpc';
      } else {
        // Uncertain identifier (D2): proves the surface, not the payment.
        // Channel stays UNKNOWN unless explicit paid evidence exists in UTMs;
        // promotion uses the platform's own paid channel class.
        channel =
          PAID_MEDIUMS.includes(touch.medium.toLowerCase()) && plat.paidChannel
            ? plat.paidChannel
            : classifyUtmChannel(touch.medium);
      }
    } else {
      channel = 'unknown';
    }
  } else {
    channel = classifyUtmChannel(touch.medium);
  }

  touch.referrer = storedReferrer;
  const channelLabel = resolveChannelLabel({
    source: touch.source, medium: touch.medium, clickIds, referrer,
  });
  if (!inferSourceMedium) {
    touch.source = receivedSource;
    touch.medium = receivedMedium;
  }
  const withClickIds: ParsedTouch = { ...touch, clickIds, browserIds, channel, channelLabel };
  return { kind: 'touch', touch: withClickIds };
}

function classifyUtmChannel(medium: string): Channel {
  const m = medium.toLowerCase();
  if (m.includes('cpc') || m.includes('ppc') || m.includes('paid')) return 'paid_other';
  if (m === 'email' || m.includes('newsletter')) return 'email';
  if (m === 'affiliate') return 'affiliate';
  if (m === 'referral') return 'referral';
  if (m === 'organic') return 'organic_search';
  if (m === 'social' || m.includes('social')) return 'organic_social';
  return 'unknown';
}

/**
 * Placeholder for a landing without signal (opt-in `recordDirectTouch`).
 * `direct`: no usable referrer; source/medium follow the GA convention
 * `(direct)` / `(none)` unless `inferSourceMedium` is off. `before_capture`:
 * a same-site referrer, so the visit began before capture and its origin is
 * unknown.
 */
function unmeasuredTouch(
  now: string,
  landingPage: string,
  browserIds: Record<string, string>,
  kind: 'direct' | 'before_capture',
  inferSourceMedium: boolean,
): ParsedTouch {
  const touch = emptyTouch(now, landingPage);
  if (kind === 'direct' && inferSourceMedium) {
    touch.source = '(direct)';
    touch.medium = '(none)';
  }
  return {
    ...touch,
    browserIds,
    channel: kind === 'direct' ? 'direct' : 'unknown',
    channelLabel: kind === 'direct' ? CHANNEL_LABELS.DIRECT : CHANNEL_LABELS.BEFORE_CAPTURE,
    unmeasured: true,
  };
}

/**
 * Stored landing page. `'url'` keeps the FULL href including query string
 * (ruling #12, plugin contract). Privacy note: consent already gates storage
 * upstream; hosts that must not store the query opt into a path format.
 * Path formats drop the fragment; allowlisted keys match case-insensitively
 * (ruling #9) and keep their URL order.
 */
function landingPageOf(url: string, format: LandingPageFormat, allowlist: readonly string[]): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (format === 'url') return sanitizeField(u.href);
  if (format === 'path') return sanitizeField(u.pathname);
  const allowed = new Set(allowlist.map((key) => key.toLowerCase()));
  const kept = new URLSearchParams();
  for (const [key, value] of u.searchParams) {
    if (allowed.has(key.toLowerCase())) kept.append(key, value);
  }
  const search = kept.toString();
  return sanitizeField(search ? `${u.pathname}?${search}` : u.pathname);
}

/** Stored referrer: the full URL (`'url'`) or its http(s) hostname (`'host'`). */
function referrerOf(referrer: string, format: ReferrerFormat): string {
  if (format === 'url' || !referrer) return sanitizeField(referrer);
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return sanitizeField(u.hostname);
  } catch {
    return '';
  }
}
