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
  // Uncertain-certainty click-ID platforms WITHOUT paid evidence (ruling D2):
  // the surface is proven, the payment is not.
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  TWITTER_X: 'X',
  SNAPCHAT: 'Snapchat',
  PINTEREST: 'Pinterest',
  // Fallback
  UNKNOWN: 'Unknown',
} as const;

/**
 * LEGACY compatibility output ONLY (Hugo gate D2). Maps classifications to the
 * WordPress plugin v1.8.x human labels so parity consumers can opt into the old
 * strings during migration. Never write these through the canonical pipeline;
 * kept versioned so the shim has its own lifecycle.
 */
export const LEGACY_WP_LABEL_VERSION = '1';
export function legacyWordPressChannelLabel(input: {
  clickIds: Record<string, string | undefined>;
  medium: string;
}): string {
  const ids = input.clickIds;
  if (ids.gclid || ids.gbraid || ids.wbraid) return CHANNEL_LABELS.GOOGLE_ADS;
  if (ids.msclkid) return CHANNEL_LABELS.MICROSOFT_ADS;
  if (ids.li_fat_id) return CHANNEL_LABELS.LINKEDIN_ADS;
  if (ids.twclid) return CHANNEL_LABELS.X_ADS;
  if (ids.ttclid) return CHANNEL_LABELS.TIKTOK_ADS;
  if (ids.epik) return CHANNEL_LABELS.PINTEREST_ADS;
  if (ids.sccid) return CHANNEL_LABELS.SNAPCHAT_ADS;
  if (ids.fbclid) {
    return PAID_MEDIUMS.includes(input.medium.trim().toLowerCase())
      ? CHANNEL_LABELS.FACEBOOK_ADS
      : CHANNEL_LABELS.FACEBOOK_ORGANIC;
  }
  return CHANNEL_LABELS.UNKNOWN;
}

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

  // Click IDs — highest priority, checked before referrer. Certainty-tiered
  // per Hugo gate ruling D2: advertising-only identifiers get their Ads label;
  // uncertain identifiers get the plain platform label UNLESS explicit paid
  // evidence (a paid utm_medium) promotes them.
  const medium = input.medium.trim().toLowerCase();
  const hasPaidEvidence = PAID_MEDIUMS.includes(medium);
  if (ids.gclid || ids.gbraid || ids.wbraid) return CHANNEL_LABELS.GOOGLE_ADS;
  if (ids.msclkid) return CHANNEL_LABELS.MICROSOFT_ADS;
  if (ids.li_fat_id) return hasPaidEvidence ? CHANNEL_LABELS.LINKEDIN_ADS : CHANNEL_LABELS.LINKEDIN;
  if (ids.twclid) return hasPaidEvidence ? CHANNEL_LABELS.X_ADS : CHANNEL_LABELS.TWITTER_X;
  if (ids.ttclid) return hasPaidEvidence ? CHANNEL_LABELS.TIKTOK_ADS : CHANNEL_LABELS.TIKTOK;
  if (ids.epik) return hasPaidEvidence ? CHANNEL_LABELS.PINTEREST_ADS : CHANNEL_LABELS.PINTEREST;
  if (ids.sccid) return hasPaidEvidence ? CHANNEL_LABELS.SNAPCHAT_ADS : CHANNEL_LABELS.SNAPCHAT;
  if (ids.fbclid) return hasPaidEvidence ? CHANNEL_LABELS.FACEBOOK_ADS : CHANNEL_LABELS.FACEBOOK;

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

  return CHANNEL_LABELS.UNKNOWN;
}

/**
 * Click-ID parameter -> platform mapping with PAID CERTAINTY tiers (Hugo gate
 * ruling D2): some identifiers are added ONLY by advertising platforms
 * (certain -> paid classification); others are appended to organic/outbound
 * links too (uncertain -> traffic_class stays UNKNOWN until explicit paid
 * evidence such as a paid utm_medium arrives).
 */
export type PaidCertainty = 'certain' | 'uncertain';

export const CLICK_ID_PLATFORMS: Readonly<
  Record<
    string,
    { source: string; certainty: PaidCertainty; paidChannel?: Channel }
  >
> = {
  // Advertising-only identifiers: paid classification is unambiguous.
  gclid:     { source: 'google',    certainty: 'certain', paidChannel: 'paid_search' },
  wbraid:    { source: 'google',    certainty: 'certain', paidChannel: 'paid_search' },
  gbraid:    { source: 'google',    certainty: 'certain', paidChannel: 'paid_search' },
  msclkid:   { source: 'bing',      certainty: 'certain', paidChannel: 'paid_search' },
  // Platform identifiers also appended to non-paid outbound links: the mere
  // presence proves the SURFACE, not the payment (D2). paidChannel applies
  // only when explicit paid evidence exists alongside.
  fbclid:    { source: 'facebook',  certainty: 'uncertain', paidChannel: 'paid_social' },
  ttclid:    { source: 'tiktok',    certainty: 'uncertain', paidChannel: 'paid_social' },
  twclid:    { source: 'twitter',   certainty: 'uncertain', paidChannel: 'paid_social' },
  li_fat_id: { source: 'linkedin',  certainty: 'uncertain', paidChannel: 'paid_social' },
  sccid:     { source: 'snapchat',  certainty: 'uncertain', paidChannel: 'paid_social' },
  epik:      { source: 'pinterest', certainty: 'uncertain', paidChannel: 'paid_social' },
};

/** D3 additive payload keys (click-ID selection audit trail). */
export const CLICK_ID_HISTORY_KEY = 'click_id_history';
export const ATTRIBUTION_SELECTED_CLICK_ID_KEY = 'attribution_selected_click_id';
export const ATTRIBUTION_SELECTED_CLICK_ID_REASON_KEY = 'attribution_selected_click_id_reason';

/** Hard cap on recorded click-ID history entries (oldest dropped first). */
export const CLICK_ID_HISTORY_LIMIT = 50;

/** Canonical click ID keys in payload order (sc_click_id is an alias of sccid). */
export const CLICK_ID_KEYS: readonly string[] = [
  'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid', 'twclid',
  'li_fat_id', 'sccid', 'epik',
];

/** Browser/platform identifier keys captured when consent allows. */
export const BROWSER_ID_KEYS: readonly string[] = [
  'fbc', 'fbp', 'ttp', 'li_gc', 'ga_client_id', 'ga_session_id', 'ga_session_number',
];

/**
 * Browser-ID query parameters -> canonical payload keys.
 *
 * Both bare and underscore-prefixed variants are recognized (plugin evidence:
 * BrowserIdentifiers.collect reads params.fbp || params._fbp etc.,
 * clicutcl-attribution.js:859-896). Insertion order is the plugin's
 * preference order: for one canonical key the FIRST variant with a value
 * wins. RULING (runtime findings 2026-08-23, split responsibility): these
 * IDs are collected in CORE only when they appear as URL QUERY PARAMS;
 * cookie-derived collection lives in /browser behind the consent gate.
 */
export const BROWSER_ID_PARAMS: Readonly<Record<string, string>> = {
  fbc: 'fbc',
  _fbc: 'fbc',
  fbp: 'fbp',
  _fbp: 'fbp',
  ttp: 'ttp',
  _ttp: 'ttp',
  li_gc: 'li_gc',
  ga_client_id: 'ga_client_id',
  ga_session_id: 'ga_session_id',
  ga_session_number: 'ga_session_number',
};

/**
 * Validate/normalize a GA client ID (port of the plugin's
 * parseGaClientId, clicutcl-attribution.js:826-846): keeps only the last
 * two dot-separated parts when BOTH are numeric and at least four parts
 * exist (e.g. 'GA1.1.1234567890.9876543210' -> '1234567890.9876543210').
 * Pure string function - no cookie access (ruling: core never touches cookies).
 */
export function parseGaClientIdValue(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const parts = value.split('.');
  if (parts.length >= 4) {
    const left = parts[parts.length - 2]!;
    const right = parts[parts.length - 1]!;
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) return `${left}.${right}`;
  }
  return '';
}

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
