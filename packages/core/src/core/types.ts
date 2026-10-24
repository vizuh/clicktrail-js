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

/** What happens to a value longer than the length limit. See {@link SanitizeFieldOptions}. */
export type OverLengthPolicy = 'truncate' | 'drop';

/** What happens to an unsubstituted `{{...}}` template macro. See {@link SanitizeFieldOptions}. */
export type MacroPolicy = 'drop' | 'keep';

/** What happens to a value containing control characters. See {@link SanitizeFieldOptions}. */
export type ControlCharPolicy = 'strip' | 'drop';

/**
 * Value policies for {@link sanitizeField}. Every default is the plugin
 * contract (WP-parity rulings #14-#16); a "dropped" value becomes `''`.
 */
export interface SanitizeFieldOptions {
  /** Length limit in UTF-16 code units, after trimming. Default 512; non-positive or non-integer values keep 512. */
  maxFieldLength?: number;
  /** Default `'truncate'`: cut to `maxFieldLength`. `'drop'`: store `''` instead. */
  overLengthPolicy?: OverLengthPolicy;
  /** Default `'drop'`: a whole-value `{{...}}` macro stores `''` (ruling #15). `'keep'`: store it as received. */
  macroPolicy?: MacroPolicy;
  /**
   * Default `'strip'`: delete control characters (U+0000-U+001F, U+007F),
   * then trim. `'drop'`: trim, then store `''` if any control character is left.
   */
  controlCharPolicy?: ControlCharPolicy;
}

/**
 * Inputs to {@link parseAttributionUrl}. All values come from the caller.
 *
 * The inherited {@link SanitizeFieldOptions} apply to query-parameter values:
 * UTM fields, click IDs and browser IDs. The landing page and referrer keep
 * the default policies (see `landingPageFormat` / `referrerFormat`).
 */
export interface ParseAttributionInput extends SanitizeFieldOptions {
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
   * referrer-only landings return `{ kind: 'none', reason: 'ignored_referrer' }`
   * (or the "before capture" placeholder under `recordDirectTouch`);
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
   * touch, and one that would return `internal_referrer` or
   * `ignored_referrer` yields an unmeasured `unknown` touch labelled
   * "before capture" (the visit began before capture, e.g. before consent
   * or before a payment/sign-in hop). The merge writes placeholders only
   * into an empty payload, so a stored touch is kept.
   */
  recordDirectTouch?: boolean;
  /**
   * Stored form of the referrer. Default `'url'`: the full referrer URL.
   * `'host'`: the referrer hostname ('' when it is not an http(s) URL).
   * Classification always reads the raw referrer. An ignored referrer is
   * stored as ''.
   */
  referrerFormat?: ReferrerFormat;
  /**
   * Default `true`: `source` / `medium` missing from the URL are inferred — a
   * click ID fills its platform source and, when certain, `cpc` (engine
   * addition, WP-parity ruling #2); an external referrer fills the classified
   * source and `organic` / `social` / `referral` (plugin contract);
   * `recordDirectTouch` fills `(direct)` / `(none)`.
   * `false`: `source` / `medium` keep only `utm_source` / `utm_medium` as
   * received (`''` otherwise). Inferred values still decide `channel` and
   * `channelLabel`, so stored channels and channel codes are unchanged.
   */
  inferSourceMedium?: boolean;
  /**
   * Length limit for click-ID values, in UTF-16 code units after trimming.
   * Default: `maxFieldLength`. Lets a host keep a shorter limit for click IDs
   * than for UTM values (e.g. 64 / 120). `overLengthPolicy` applies.
   */
  maxClickIdLength?: number;
  /**
   * Default `false`: a UTM or click-ID parameter counts as a signal when it
   * is present and non-empty, even if a value policy then drops it.
   * `true`: only values that survive sanitizing count, so a landing whose
   * only signals were dropped follows the no-signal path (referrer
   * inference, `recordDirectTouch` placeholder, or no touch).
   */
  signalAfterSanitize?: boolean;
  /**
   * Default: every key in {@link UTM_PARAM_TO_FIELD} and
   * {@link CLICK_ID_KEYS} forms a touch. When set, only the listed keys are
   * read: an unlisted UTM key or click ID is neither a signal nor stored.
   * Entries are canonical lowercase names (`utm_source`, `gclid`); an alias
   * (`sc_click_id`) counts as its canonical key. An omitted list keeps the
   * full default set for that kind; an empty list disables that kind.
   */
  signalKeys?: SignalKeys;
  /**
   * Which referrer hosts count as internal. Default `'related'` (ruling #8):
   * the current host and any host that contains it or that it contains, so
   * `blog.example.com` -> `www.example.com` creates no touch.
   * `'same-host'`: only the current host (ignoring `www.` and port); a
   * sibling or parent subdomain classifies like any external referrer.
   */
  internalReferrer?: InternalReferrerPolicy;
  /**
   * Default `false` (ruling #9): UTM and click-ID keys match
   * case-insensitively, so `UTM_SOURCE` reads as `utm_source`. `true`: they
   * match exactly, like `URLSearchParams.get`. Browser-ID parameters and the
   * landing-page allowlist keep case-insensitive matching.
   */
  caseSensitiveParams?: boolean;
}

/** Keys allowed to form a touch. See {@link ParseAttributionInput.signalKeys}. */
export interface SignalKeys {
  /** UTM parameter names, e.g. `['utm_source', 'utm_medium']`. */
  utm?: readonly string[];
  /** Canonical click-ID keys, e.g. `['gclid', 'fbclid']`. */
  clickIds?: readonly string[];
}

/** See {@link ParseAttributionInput.internalReferrer}. */
export type InternalReferrerPolicy = 'related' | 'same-host';

/** Options for {@link mergeAttributionTouch}. Every default is the plugin contract. */
export interface MergeAttributionOptions {
  /**
   * Default `false` (ruling B): a last-touch write sets `lt_<clickid>` only
   * for click IDs on the new touch, so an older click ID survives under a
   * newer last touch. `true`: the write also clears `lt_<clickid>` for
   * click IDs absent from the new touch. `ft_<clickid>`, top-level click IDs
   * and `click_id_history` are unchanged.
   */
  clearLastTouchClickIds?: boolean;
}

/** Options for {@link mergeAttributionTouch}. */
export interface MergeAttributionOptions {
  /**
   * Also write the machine `Channel` code (e.g. 'paid_search') to
   * `ft_channel_code` / `lt_channel_code`, next to the unchanged
   * `ft_channel` / `lt_channel` labels. Default false: the WordPress plugin
   * writes labels only, so the keys are absent unless a host opts in.
   */
  channelCodes?: boolean;
}

/** Result of a parse attempt: a touch, or a reason no touch was created. */
export type ParseResult =
  | { kind: 'touch'; touch: ParsedTouch }
  | { kind: 'none'; reason: 'internal_referrer' | 'ignored_referrer' | 'no_signal'; detail?: string };
