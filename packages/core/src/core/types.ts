/**
 * Canonical payload and touch types.
 *
 * The stored attribution shape is a FLAT record with `ft_`/`lt_` prefixes,
 * matching the WordPress plugin contract so parity testing is direct.
 */

export interface AttributionTouch {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  utmId: string;
  utmSourcePlatform: string;
  utmCreativeFormat: string;
  utmMarketingTactic: string;
  referrer: string;
  landingPage: string;
  touchTimestamp: string;
}

/** Flat canonical payload: ft_/lt_ touches + top-level click & browser IDs. */
export type AttributionPayload = Record<string, string>;

/** A parsed attribution signal extracted from a URL + referrer pair. */
export interface ParsedTouch extends AttributionTouch {
  /** Classification result derived from click IDs, UTMs, or referrer class. */
  channel: import('../conventions/stable.js').Channel;
  /**
   * Human-readable channel label (CHANNEL_LABELS layer, e.g. 'Google Ads',
   * 'Facebook Organic', 'ChatGPT'). Written to ft_channel / lt_channel by merge.
   */
  channelLabel: string;
  /**
   * Click IDs found in the URL (canonical keys, aliases folded).
   * Carried here so downstream merge never needs the raw URL again.
   */
  clickIds: Record<string, string>;
  /**
   * Browser/platform identifiers found as URL QUERY PARAMS (fbc, fbp, ttp,
   * li_gc, ga_*). RULING (runtime findings 2026-08-23): core populates these
   * top-level deterministically; cookie-derived IDs are the /browser
   * adapter's job behind the consent gate. Optional so hand-built touches
   * (cross-domain continuation) stay valid without them.
   */
  browserIds?: Record<string, string>;
  /**
   * True for the placeholder touch `recordDirectTouch` builds when the URL
   * and referrer carry no signal. Merge writes it only into an empty
   * payload, and the next measured touch replaces it as first touch.
   */
  unmeasured?: boolean;
}

/** Stored form of `ft_/lt_landing_page`. See {@link ParseAttributionInput.landingPageFormat}. */
export type LandingPageFormat = 'url' | 'path' | 'path+allowlisted-query';

/** Stored form of `ft_/lt_referrer`. See {@link ParseAttributionInput.referrerFormat}. */
export type ReferrerFormat = 'url' | 'host';

/** Inputs to {@link parseAttributionUrl}. All values come from the caller. */
export interface ParseAttributionInput {
  url: string;
  referrer?: string;
  /** Host of the current page, used to ignore internal referrals. */
  currentHost?: string;
  /**
   * Injected timestamp. FROZEN FORMAT: millisecond ISO-8601, i.e.
   * '2026-08-23T10:00:00.000Z' — exactly what `new Date().toISOString()`
   * emits (ruling #13). Callers own the clock and MUST pass millisecond
   * precision; the engine stores the string verbatim.
   */
  now?: string;
  /**
   * Referrer hosts that never form a touch, typically payment and
   * hosted-checkout returns (`paypal.com`, `stripe.com`). A referrer on a
   * listed host or any subdomain of it counts like a same-site referrer:
   * referrer-only landings return `{ kind: 'none', reason: 'ignored_referrer' }`;
   * UTMs and click IDs on the URL still form a touch, with the referrer
   * blanked. Entries are normalized with {@link normalizeReferrerHosts}.
   * Default: none. {@link PAYMENT_REFERRER_HOSTS} holds the WordPress
   * plugin's default list for hosts that opt in.
   */
  ignoredReferrerHosts?: readonly string[];
  /**
   * Stored form of the landing page. Default `'url'`: the full href
   * (plugin contract, ruling #12). `'path'`: pathname only.
   * `'path+allowlisted-query'`: pathname plus the query keys in
   * `landingPageQueryAllowlist`. Fragments are dropped in both path modes.
   */
  landingPageFormat?: LandingPageFormat;
  /**
   * Query keys kept by `landingPageFormat: 'path+allowlisted-query'`, matched
   * case-insensitively (ruling #9). Default
   * {@link LANDING_PAGE_QUERY_ALLOWLIST}: UTM keys, click IDs and aliases.
   */
  landingPageQueryAllowlist?: readonly string[];
  /**
   * Default `false` (plugin contract: no signal stores nothing). When true,
   * a landing that would return `no_signal` yields an unmeasured `direct`
   * touch, and one that would return `internal_referrer` yields an
   * unmeasured `unknown` touch labelled "before capture" (the visit began
   * on another page of this site before capture, e.g. before consent).
   */
  recordDirectTouch?: boolean;
  /**
   * Stored form of the referrer. Default `'url'`: the full referrer URL.
   * `'host'`: the referrer hostname ('' when it is not an http(s) URL).
   * Classification always reads the raw referrer.
   */
  referrerFormat?: ReferrerFormat;
}

/** Result of a parse attempt: a touch, or a reason no touch was created. */
export type ParseResult =
  | { kind: 'touch'; touch: ParsedTouch }
  | { kind: 'none'; reason: 'internal_referrer' | 'ignored_referrer' | 'no_signal'; detail?: string };
