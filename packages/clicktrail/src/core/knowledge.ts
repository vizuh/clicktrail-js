/**
 * Classification knowledge tables.
 *
 * These are DATA, not logic: frozen as versioned constants so golden
 * fixtures can pin their behavior. Changes here are classifier changes.
 *
 * WP-parity rulings (docs/WP-PARITY-DRAFT.md, supervisor 2026-08-23):
 * - Referrer matching uses explicit domain-suffix rules incl. intl TLDs
 *   (search.yahoo.co.jp = yahoo). No label regex, no `.includes()` fragments.
 * - Referrer classification yields CANONICAL source names ('google',
 *   'bing', 'yahoo', ...), never raw hosts.
 * - A human-readable channel-label layer (CHANNEL_LABELS +
 *   resolveChannelLabel) ports the WordPress plugin's ft_channel/lt_channel
 *   labels, including AI-assistant referrers. Machine enum channels stay
 *   authoritative in `Channel`.
 */
import type { Channel } from '../conventions/stable.js';
import { hostMatches, normalizeHost } from './sanitize.js';

/** One referrer classification rule: `host` equals or is a subdomain of any listed domain. */
export interface ReferrerRule {
  /** Canonical source name written to the payload (contract, ruling #4). */
  source: string;
  /** Registrable domains (suffix-matched: host === d || host.endsWith('.' + d)). */
  domains: readonly string[];
}

/** Search-engine referrer rules. Brave/Startpage are intentional engine additions (ruling #6). */
export const SEARCH_REFERRER_RULES: readonly ReferrerRule[] = [
  {
    source: 'google',
    domains: [
      'google.com', 'google.ad', 'google.ae', 'google.at', 'google.be',
      'google.ca', 'google.ch', 'google.co.id', 'google.co.in', 'google.co.jp',
      'google.co.kr', 'google.co.uk', 'google.co.za', 'google.com.ar',
      'google.com.au', 'google.com.br', 'google.com.mx', 'google.com.sg',
      'google.com.tr', 'google.com.ua', 'google.cz', 'google.de', 'google.dk',
      'google.es', 'google.fi', 'google.fr', 'google.gr', 'google.hu',
      'google.ie', 'google.it', 'google.nl', 'google.no', 'google.pl',
      'google.pt', 'google.ro', 'google.ru', 'google.se',
    ],
  },
  { source: 'bing', domains: ['bing.com'] },
  {
    source: 'yahoo',
    domains: [
      'yahoo.com', 'yahoo.co.jp', 'yahoo.co.uk', 'yahoo.com.au',
      'yahoo.com.br', 'yahoo.ca', 'yahoo.de', 'yahoo.es', 'yahoo.fr',
      'yahoo.it',
    ],
  },
  { source: 'duckduckgo', domains: ['duckduckgo.com'] },
  { source: 'ecosia', domains: ['ecosia.org'] },
  {
    source: 'yandex',
    domains: ['yandex.com', 'yandex.ru', 'yandex.by', 'yandex.kz', 'yandex.com.tr', 'ya.ru'],
  },
  { source: 'baidu', domains: ['baidu.com'] },
  // Engine additions below (plugin treats these as plain referral):
  { source: 'brave', domains: ['search.brave.com'] },
  { source: 'startpage', domains: ['startpage.com'] },
];

/** Social-platform referrer rules (breadth is an intentional engine addition, ruling #7). */
export const SOCIAL_REFERRER_RULES: readonly ReferrerRule[] = [
  { source: 'facebook', domains: ['facebook.com', 'fb.com'] },
  { source: 'instagram', domains: ['instagram.com'] },
  { source: 'linkedin', domains: ['linkedin.com', 'lnkd.in'] },
  { source: 'twitter', domains: ['twitter.com', 'x.com', 't.co'] },
  { source: 'tiktok', domains: ['tiktok.com'] },
  { source: 'pinterest', domains: ['pinterest.com', 'pin.it'] },
  { source: 'youtube', domains: ['youtube.com', 'youtu.be'] },
  { source: 'reddit', domains: ['reddit.com', 'redd.it'] },
  { source: 'threads', domains: ['threads.net'] },
  { source: 'whatsapp', domains: ['whatsapp.com', 'wa.me'] },
  { source: 'telegram', domains: ['telegram.me', 't.me'] },
  { source: 'discord', domains: ['discord.com'] },
];

// --- human-readable channel-label layer (WP parity, ruling #3) ---------------

/** Version of the CHANNEL_LABELS table; bump when any label or trigger changes. */
export const CHANNEL_LABELS_VERSION = '1';

/**
 * Human-readable channel labels written to `ft_channel` / `lt_channel`.
 * Ported from the WordPress plugin v1.8.x `resolveChannelLabel()`.
 * The machine-readable `Channel` enum layer is separate and unchanged.
 */
export const CHANNEL_LABELS = {
  // Paid click-ID platforms
  GOOGLE_ADS: 'Google Ads',
  MICROSOFT_ADS: 'Microsoft Ads',
  FACEBOOK_ADS: 'Facebook Ads',
  LINKEDIN_ADS: 'LinkedIn Ads',
  X_ADS: 'X Ads',
  REDDIT_ADS: 'Reddit Ads',
  TIKTOK_ADS: 'TikTok Ads',
  PINTEREST_ADS: 'Pinterest Ads',
  SNAPCHAT_ADS: 'Snapchat Ads',
  DISPLAY_VIDEO_360: 'Display & Video 360',
  PAID_SOCIAL: 'Paid Social',
  PAID_SEARCH: 'Paid Search',
  // Email platforms (Mailchimp reserved: its mc_cid/mc_eid triggers were
  // dropped from capture per ruling #1)
  MAILCHIMP: 'Mailchimp',
  HUBSPOT: 'HubSpot',
  SALESFORCE_PARDOT: 'Salesforce Pardot',
  CONSTANT_CONTACT: 'Constant Contact',
  // AI-assistant referrers
  CHATGPT: 'ChatGPT',
  PERPLEXITY: 'Perplexity',
  MICROSOFT_COPILOT: 'Microsoft Copilot',
  GEMINI: 'Gemini',
  CLAUDE: 'Claude',
  GROK: 'Grok',
  DEEPSEEK: 'DeepSeek',
  // Organic search referrers (Brave/Startpage/Ecosia/Baidu are engine additions)
  GOOGLE_ORGANIC: 'Google Organic',
  BING_ORGANIC: 'Bing Organic',
  YAHOO: 'Yahoo',
  DUCKDUCKGO: 'DuckDuckGo',
  YANDEX: 'Yandex',
  BRAVE: 'Brave',
  STARTPAGE: 'Startpage',
  ECOSIA: 'Ecosia',
  BAIDU: 'Baidu',
  // Organic social referrers
  FACEBOOK_ORGANIC: 'Facebook Organic',
  INSTAGRAM_ORGANIC: 'Instagram Organic',
  LINKEDIN_ORGANIC: 'LinkedIn Organic',
  X_ORGANIC: 'X Organic',
  REDDIT_ORGANIC: 'Reddit Organic',
  TIKTOK_ORGANIC: 'TikTok Organic',
  PINTEREST_ORGANIC: 'Pinterest Organic',
  YOUTUBE_ORGANIC: 'YouTube',
  THREADS: 'Threads',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  DISCORD: 'Discord',
  // Fallback
  UNKNOWN: 'Unknown',
} as const;

/** utm_medium values that mark a visit as PAID (ported from the plugin). */
export const PAID_MEDIUMS: readonly string[] = ['cpc', 'ppc', 'paid', 'paidsearch', 'paid_social'];

interface AiAssistantRule {
  label: string;
  domains: readonly string[];
}

/**
 * AI-assistant referrer hosts (ported from the plugin, attribution.js:347-360).
 * Checked BEFORE search-engine rules so gemini.google.com does not match Google Organic.
 */
const AI_ASSISTANT_RULES: readonly AiAssistantRule[] = [
  { label: CHANNEL_LABELS.CHATGPT, domains: ['chatgpt.com', 'chat.openai.com'] },
  { label: CHANNEL_LABELS.PERPLEXITY, domains: ['perplexity.ai'] },
  { label: CHANNEL_LABELS.MICROSOFT_COPILOT, domains: ['copilot.microsoft.com'] },
  { label: CHANNEL_LABELS.GEMINI, domains: ['gemini.google.com'] },
  { label: CHANNEL_LABELS.CLAUDE, domains: ['claude.ai'] },
  { label: CHANNEL_LABELS.GROK, domains: ['grok.com'] },
  { label: CHANNEL_LABELS.DEEPSEEK, domains: ['deepseek.com'] },
];

/** Canonical referrer source -> channel label (search engines first, then social). */
const REFERRER_SOURCE_LABELS: Readonly<Record<string, string>> = {
  google: CHANNEL_LABELS.GOOGLE_ORGANIC,
  bing: CHANNEL_LABELS.BING_ORGANIC,
  yahoo: CHANNEL_LABELS.YAHOO,
  duckduckgo: CHANNEL_LABELS.DUCKDUCKGO,
  ecosia: CHANNEL_LABELS.ECOSIA,
  yandex: CHANNEL_LABELS.YANDEX,
  baidu: CHANNEL_LABELS.BAIDU,
  brave: CHANNEL_LABELS.BRAVE,
  startpage: CHANNEL_LABELS.STARTPAGE,
  facebook: CHANNEL_LABELS.FACEBOOK_ORGANIC,
  instagram: CHANNEL_LABELS.INSTAGRAM_ORGANIC,
  linkedin: CHANNEL_LABELS.LINKEDIN_ORGANIC,
  twitter: CHANNEL_LABELS.X_ORGANIC,
  tiktok: CHANNEL_LABELS.TIKTOK_ORGANIC,
  pinterest: CHANNEL_LABELS.PINTEREST_ORGANIC,
  youtube: CHANNEL_LABELS.YOUTUBE_ORGANIC,
  reddit: CHANNEL_LABELS.REDDIT_ORGANIC,
  threads: CHANNEL_LABELS.THREADS,
  whatsapp: CHANNEL_LABELS.WHATSAPP,
  telegram: CHANNEL_LABELS.TELEGRAM,
  discord: CHANNEL_LABELS.DISCORD,
};

/** Map a paid visit's utm_source onto its ad-network label (ported verbatim). */
function paidLabelFromSource(source: string, medium: string): string {
  if (['google', 'google ads', 'googleads', 'youtube', 'gdn'].includes(source)) {
    return CHANNEL_LABELS.GOOGLE_ADS;
  }
  if (['bing', 'microsoft', 'msn'].includes(source)) return CHANNEL_LABELS.MICROSOFT_ADS;
  if (['facebook', 'meta', 'instagram', 'fb', 'ig'].includes(source)) return CHANNEL_LABELS.FACEBOOK_ADS;
  if (source === 'linkedin') return CHANNEL_LABELS.LINKEDIN_ADS;
  if (['twitter', 'x'].includes(source)) return CHANNEL_LABELS.X_ADS;
  if (source === 'reddit') return CHANNEL_LABELS.REDDIT_ADS;
  if (source === 'tiktok') return CHANNEL_LABELS.TIKTOK_ADS;
  if (source === 'pinterest') return CHANNEL_LABELS.PINTEREST_ADS;
  if (['snapchat', 'snap'].includes(source)) return CHANNEL_LABELS.SNAPCHAT_ADS;
  return medium === 'paid_social' ? CHANNEL_LABELS.PAID_SOCIAL : CHANNEL_LABELS.PAID_SEARCH;
}

interface ReferrerParts {
  host: string;
  pathname: string;
}

/** Parse an external referrer into normalized host + pathname; null unless http(s). */
function referrerParts(rawReferrer: string | undefined): ReferrerParts | null {
  if (!rawReferrer) return null;
  try {
    const u = new URL(rawReferrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = normalizeHost(u.host);
    if (!host) return null;
    return { host, pathname: u.pathname };
  } catch {
    return null;
  }
}

function matchesAnyDomain(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostMatches(host, domain));
}

/** Inputs to {@link resolveChannelLabel}: the FINAL parsed touch fields. */
export interface ChannelLabelInput {
  /** Touch source (canonical name or raw host for plain referrals). */
  source: string;
  /** Touch medium (UTM value or inferred 'cpc'/'organic'/'social'/'referral'). */
  medium: string;
  /** Canonical click IDs found in the URL. */
  clickIds: Readonly<Record<string, string>>;
  /** Raw external referrer URL, if any. */
  referrer?: string;
}

/**
 * Resolve the human-readable channel label for a touch.
 *
 * Faithful port of the plugin's `resolveChannelLabel()` priority chain:
 * click IDs -> fbclid+paid-medium -> email-platform sources -> paid-medium
 * fallback -> referrer classification (AI assistants before search engines)
 * -> bare-fbclid organic fallback -> Unknown.
 */
export function resolveChannelLabel(input: ChannelLabelInput): string {
  const ids = input.clickIds;

  // Paid click IDs — highest priority, checked before referrer.
  if (ids.gclid || ids.gbraid || ids.wbraid) return CHANNEL_LABELS.GOOGLE_ADS;
  if (ids.msclkid) return CHANNEL_LABELS.MICROSOFT_ADS;
  if (ids.li_fat_id) return CHANNEL_LABELS.LINKEDIN_ADS;
  if (ids.twclid) return CHANNEL_LABELS.X_ADS;
  if (ids.ttclid) return CHANNEL_LABELS.TIKTOK_ADS;
  if (ids.epik) return CHANNEL_LABELS.PINTEREST_ADS;
  if (ids.sccid) return CHANNEL_LABELS.SNAPCHAT_ADS;

  // fbclid: Ads only when a paid medium is also present.
  const medium = input.medium.trim().toLowerCase();
  if (ids.fbclid && PAID_MEDIUMS.includes(medium)) return CHANNEL_LABELS.FACEBOOK_ADS;

  // Email platform signals (mc_* triggers dropped per ruling #1).
  const source = input.source.trim().toLowerCase();
  if (source === 'hubspot') return CHANNEL_LABELS.HUBSPOT;
  if (source === 'pardot') return CHANNEL_LABELS.SALESFORCE_PARDOT;
  if (source === 'constantcontact') return CHANNEL_LABELS.CONSTANT_CONTACT;

  // Paid medium with no surviving click ID — classify by source before the
  // referrer block so a paid Google visit does not fall through to organic.
  if (PAID_MEDIUMS.includes(medium)) return paidLabelFromSource(source, medium);

  // Referrer-based classification.
  const ref = referrerParts(input.referrer);
  if (ref) {
    // AI assistants — before search engines so gemini.google.com does not match Google Organic.
    for (const rule of AI_ASSISTANT_RULES) {
      if (matchesAnyDomain(ref.host, rule.domains)) return rule.label;
    }
    if (
      matchesAnyDomain(ref.host, ['bing.com']) && ref.pathname.startsWith('/chat')
    ) return CHANNEL_LABELS.MICROSOFT_COPILOT;
    if (
      matchesAnyDomain(ref.host, ['x.com']) && ref.pathname.startsWith('/i/grok')
    ) return CHANNEL_LABELS.GROK;

    for (const rule of SEARCH_REFERRER_RULES) {
      if (matchesAnyDomain(ref.host, rule.domains)) return REFERRER_SOURCE_LABELS[rule.source] ?? CHANNEL_LABELS.UNKNOWN;
    }
    for (const rule of SOCIAL_REFERRER_RULES) {
      if (matchesAnyDomain(ref.host, rule.domains)) return REFERRER_SOURCE_LABELS[rule.source] ?? CHANNEL_LABELS.UNKNOWN;
    }
  }

  // fbclid without paid medium defaults to organic Facebook (unreachable in
  // the engine today: the click-ID path always infers medium=cpc — kept for parity).
  if (ids.fbclid) return CHANNEL_LABELS.FACEBOOK_ORGANIC;

  return CHANNEL_LABELS.UNKNOWN;
}

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
    channel: `${prefix}_channel`,
    referrer: `${prefix}_referrer`,
    landingPage: `${prefix}_landing_page`,
    touchTimestamp: `${prefix}_touch_timestamp`,
  };
}
