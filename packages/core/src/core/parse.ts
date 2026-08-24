import type { Channel } from '../conventions/stable.js';
import type { AttributionTouch, ParseAttributionInput, ParseResult, ParsedTouch } from './types.js';
import {
  BROWSER_ID_PARAMS,
  CLICK_ID_KEYS,
  CLICK_ID_PLATFORMS,
  PARAM_ALIASES,
  SEARCH_REFERRER_RULES,
  SOCIAL_REFERRER_RULES,
  UTM_PARAM_TO_FIELD,
  parseGaClientIdValue,
  resolveChannelLabel,
  type ReferrerRule,
  PAID_MEDIUMS,
} from './knowledge.js';
import { areRelatedHosts, hostMatches, normalizeHost, sanitizeField } from './sanitize.js';

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
 * - A click ID without UTMs still yields a paid touch via its platform map.
 * - Browser-ID query params (fbc/fbp/ttp/li_gc/ga_*) ride along on the parsed
 *   touch and land top-level at merge time; bare fbclid derives an fbc.
 * - The landing page stores the FULL href including query string (ruling #12).
 */
export function parseAttributionUrl(input: ParseAttributionInput): ParseResult {
  const now = input.now ? input.now : '';
  const query = readQuery(input.url);
  const landingPage = landingPageOf(input.url);

  // --- collect UTM fields ---
  let hasUtm = false;
  const touch = emptyTouch(now, landingPage);
  if (query) {
    for (const [param, field] of Object.entries(UTM_PARAM_TO_FIELD)) {
      const raw = query.get(param);
      if (raw != null && raw !== '') {
        touch[field] = sanitizeField(raw);
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
        if (value) clickIds[canonical] = sanitizeField(value);
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
      const parsed = parseGaClientIdValue(sanitizeField(raw));
      if (parsed) browserIds[canonical] = parsed;
    } else {
      browserIds[canonical] = sanitizeField(raw);
    }
  }
  // Plugin evidence (:860-866): a bare fbclid derives an fbc when no explicit
  // fbc exists: 'fb.1.' + epochMillis + '.' + fbclid. Deterministic here via
  // the injected `now`; skipped when the clock is absent/unparseable.
  if (!browserIds.fbc && clickIds.fbclid) {
    const nowMs = now ? Date.parse(now) : NaN;
    if (!Number.isNaN(nowMs)) {
      browserIds.fbc = sanitizeField(`fb.1.${nowMs}.${clickIds.fbclid}`);
    }
  }

  if (!hasUtm && !hasClickId) {
    // --- referrer inference path ---
    const rHost = input.referrer ? referrerHostOf(input.referrer) : '';
    if (!rHost) {
      return { kind: 'none', reason: 'no_signal' };
    }
    const pageHost = input.currentHost ? normalizeHost(input.currentHost) : '';
    if (pageHost && areRelatedHosts(rHost, pageHost)) {
      return { kind: 'none', reason: 'internal_referrer' };
    }
    const inferred = classifyReferrerHost(rHost);
    touch.source = sanitizeField(inferred.source);
    touch.medium =
      inferred.channel === 'organic_search' ? 'organic'
      : inferred.channel === 'organic_social' ? 'social'
      : 'referral';
    touch.referrer = sanitizeField(input.referrer ?? '');
    const channelLabel = resolveChannelLabel({
      source: touch.source, medium: touch.medium, clickIds: {}, referrer: input.referrer ?? '',
    });
    return {
      kind: 'touch',
      touch: { ...touch, clickIds: {}, browserIds, channel: inferred.channel, channelLabel },
    };
  }

  // --- campaign-parameter path ---
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

  touch.referrer = sanitizeField(input.referrer ?? '');
  const channelLabel = resolveChannelLabel({
    source: touch.source, medium: touch.medium, clickIds, referrer: input.referrer ?? '',
  });
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
 * Landing page stores the FULL href including query string (ruling #12).
 * Privacy note: consent already gates storage upstream; revisit redaction
 * if PII patterns are observed in query strings.
 */
function landingPageOf(url: string): string {
  try {
    return sanitizeField(new URL(url).href);
  } catch {
    return '';
  }
}
