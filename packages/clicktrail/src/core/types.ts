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
  /** Injected timestamp (ISO-8601). Callers own the clock. */
  now?: string;
}

/** Result of a parse attempt: a touch, or a reason no touch was created. */
export type ParseResult =
  | { kind: 'touch'; touch: ParsedTouch }
  | { kind: 'none'; reason: 'internal_referrer' | 'no_signal'; detail?: string };
