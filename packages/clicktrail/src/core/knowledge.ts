/**
 * Classification knowledge tables.
 *
 * These are DATA, not logic: frozen as versioned constants so golden
 * fixtures can pin their behavior. Changes here are classifier changes.
 */
import type { Channel } from '../conventions/stable.js';

/** Host fragments classified as organic search. Matched as suffix of the referrer host. */
export const ORGANIC_SEARCH_HOSTS: readonly string[] = [
  'google.', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org',
  'search.brave.com', 'startpage.com', 'yandex.', 'baidu.com',
];

/** Hosts classified as organic social. */
export const ORGANIC_SOCIAL_HOSTS: readonly string[] = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'lnkd.in',
  'twitter.com', 'x.com', 't.co', 'tiktok.com', 'pinterest.', 'pin.it',
  'youtube.com', 'youtu.be', 'reddit.com', 'redd.it', 'threads.net',
  'whatsapp.com', 'wa.me', 'telegram.me', 't.me', 'discord.com',
];

/** Click-ID parameter -> ad platform mapping (paid channels). */
export const CLICK_ID_PLATFORMS: Readonly<Record<string, { source: string; channel: Channel }>> = {
  gclid:    { source: 'google',   channel: 'paid_search' },
  wbraid:   { source: 'google',   channel: 'paid_search' },
  gbraid:   { source: 'google',   channel: 'paid_search' },
  fbclid:   { source: 'facebook', channel: 'paid_social' },
  msclkid:  { source: 'bing',     channel: 'paid_search' },
  ttclid:   { source: 'tiktok',   channel: 'paid_social' },
  twclid:   { source: 'twitter',  channel: 'paid_social' },
  li_fat_id:{ source: 'linkedin', channel: 'paid_social' },
  sccid:    { source: 'snapchat', channel: 'paid_social' },
  epik:     { source: 'pinterest',channel: 'paid_social' },
};

/** Canonical click ID keys in payload order (sc_click_id is an alias of sccid). */
export const CLICK_ID_KEYS: readonly string[] = [
  'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid', 'twclid',
  'li_fat_id', 'sccid', 'epik',
];

/** Browser/platform identifier keys captured when consent allows. */
export const BROWSER_ID_KEYS: readonly string[] = [
  'fbc', 'fbp', 'ttp', 'li_gc', 'ga_client_id', 'ga_session_id', 'ga_session_number',
];

/** UTM query parameter -> touch field mapping. */
export const UTM_PARAM_TO_FIELD: Readonly<Record<string, keyof TouchFieldMap>> = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign',
  utm_term: 'term',
  utm_content: 'content',
  utm_id: 'utmId',
  utm_source_platform: 'utmSourcePlatform',
  utm_creative_format: 'utmCreativeFormat',
  utm_marketing_tactic: 'utmMarketingTactic',
};

/** Alias parameter names folded into canonical keys. */
export const PARAM_ALIASES: Readonly<Record<string, string>> = {
  sc_click_id: 'sccid',
};

/** Field-name -> flat payload key mapping for one touch. */
export interface TouchFieldMap {
  source: string; medium: string; campaign: string; term: string; content: string;
  utmId: string; utmSourcePlatform: string; utmCreativeFormat: string; utmMarketingTactic: string;
}

export function touchKeys(prefix: 'ft' | 'lt') {
  return {
    source: `${prefix}_source`,
    medium: `${prefix}_medium`,
    campaign: `${prefix}_campaign`,
    term: `${prefix}_term`,
    content: `${prefix}_content`,
    utmId: `${prefix}_utm_id`,
    utmSourcePlatform: `${prefix}_utm_source_platform`,
    utmCreativeFormat: `${prefix}_utm_creative_format`,
    utmMarketingTactic: `${prefix}_utm_marketing_tactic`,
    referrer: `${prefix}_referrer`,
    landingPage: `${prefix}_landing_page`,
    touchTimestamp: `${prefix}_touch_timestamp`,
  };
}
