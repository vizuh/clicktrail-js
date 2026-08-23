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
}

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
}

/** Result of a parse attempt: a touch, or a reason no touch was created. */
export type ParseResult =
  | { kind: 'touch'; touch: ParsedTouch }
  | { kind: 'none'; reason: 'internal_referrer' | 'no_signal'; detail?: string };
