import type { Channel } from '../conventions/stable.js';
import type { AttributionTouch, ParseAttributionInput, ParseResult, ParsedTouch } from './types.js';
import {
  CLICK_ID_KEYS,
  CLICK_ID_PLATFORMS,
  ORGANIC_SEARCH_HOSTS,
  ORGANIC_SOCIAL_HOSTS,
  PARAM_ALIASES,
  UTM_PARAM_TO_FIELD,
} from './knowledge.js';
import { hostMatches, normalizeHost, sanitizeField } from './sanitize.js';

function emptyTouch(now?: string, landingPage = ''): AttributionTouch & { clickIds: Record<string, string> } {
  return {
    source: '', medium: '', campaign: '', term: '', content: '',
    utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
    referrer: '', landingPage, touchTimestamp: now ?? '',
    clickIds: {},
  };
}

function classifyReferrerHost(referrerHost: string): { source: string; channel: Channel } {
  for (const frag of ORGANIC_SEARCH_HOSTS) {
    if (referrerHost.includes(frag)) return { source: referrerHost, channel: 'organic_search' };
  }
  for (const frag of ORGANIC_SOCIAL_HOSTS) {
    if (referrerHost.includes(frag)) return { source: referrerHost, channel: 'organic_social' };
  }
  return { source: referrerHost, channel: 'referral' };
}

/** Extract the host portion of a referrer URL; '' when unparseable/same-page anchor. */
export function referrerHostOf(referrer: string): string {
  try {
    const u = new URL(referrer);
    return normalizeHost(u.host);
  } catch {
    return '';
  }
}

interface QueryValues {
  get(key: string): string | undefined;
  keys(): string[];
}

/** Minimal deterministic query reader over a URL string (also unit-testable with synthetic maps). */
export function readQuery(url: string): QueryValues | null {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    return {
      get: (k) => params.get(k) ?? undefined,
      keys: () => Array.from(new Set(params.keys())),
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
 *   referral. Same-site or related-host referrers create NO new touch.
 * - A click ID without UTMs still yields a paid touch via its platform map.
 */
export function parseAttributionUrl(input: ParseAttributionInput): ParseResult {
  const now = input.now ? input.now : '';
  const query = readQuery(input.url);
  const landingPage = safeOriginPath(input.url);

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

  if (!hasUtm && !hasClickId) {
    // --- referrer inference path ---
    const rHost = input.referrer ? referrerHostOf(input.referrer) : '';
    if (!rHost) {
      return { kind: 'none', reason: 'no_signal' };
    }
    const pageHost = input.currentHost ? normalizeHost(input.currentHost) : '';
    if (pageHost && hostMatches(rHost, pageHost)) {
      return { kind: 'none', reason: 'internal_referrer' };
    }
    const inferred = classifyReferrerHost(rHost);
    touch.source = sanitizeField(inferred.source);
    touch.medium =
      inferred.channel === 'organic_search' ? 'organic'
      : inferred.channel === 'organic_social' ? 'social'
      : 'referral';
    touch.referrer = sanitizeField(input.referrer ?? '');
    return { kind: 'touch', touch: { ...touch, clickIds: {}, channel: inferred.channel } };
  }

  // --- campaign-parameter path ---
  let channel: Channel;
  if (hasClickId) {
    // Platform map decides channel; first matching click ID wins (deterministic order).
    const matched = CLICK_ID_KEYS.find((key) => Boolean(clickIds[key]));
    if (matched) {
      const plat = CLICK_ID_PLATFORMS[matched]!;
      channel = plat.channel;
      if (!touch.source) touch.source = plat.source;
    } else {
      channel = 'unknown';
    }
    if (!touch.medium) touch.medium = 'cpc';
  } else {
    channel = classifyUtmChannel(touch.medium);
  }

  touch.referrer = sanitizeField(input.referrer ?? '');
  const withClickIds: ParsedTouch = { ...touch, clickIds, channel };
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

function safeOriginPath(url: string): string {
  try {
    const u = new URL(url);
    return sanitizeField(`${u.origin}${u.pathname}`);
  } catch {
    return '';
  }
}
