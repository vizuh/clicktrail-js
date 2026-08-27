/**
 * ClickTrail stable attribution conventions.
 *
 * Modeled on OpenTelemetry semantic-conventions:
 * - the main entry point is STABLE and follows semver 2.0 strictly;
 * - experimental concepts live in `@vizuh/clicktrail/incubating`;
 * - constants exist so IDE autocomplete and greps stay readable.
 *
 * Naming scheme: ATTR_${attributeName}, ${NAME}_VALUE_${enum}, EVENT_${eventName}.
 */

/**
 * Schema version of the canonical flat payload. Additive changes only within
 * a major. 1.1.0 adds ft_channel / lt_channel (WP-parity channel-label layer).
 *
 * NOTE: 1.x is the UNPUBLISHED development line (package pre-release); these
 * bumps record semantic decisions, not published breaking releases.
 */
export const SCHEMA_VERSION = '1.2.0' as const;

/**
 * Version of the channel classification rules. Semantic changes are MAJOR
 * releases once published; see the 1.x development-line note above.
 * 1.1.0: canonical referrer source names, explicit domain-suffix rules,
 * macro rejection, symmetric related-host check, case-insensitive/last-wins
 * query parsing, full-href landing page, click-ID-aware first-touch guard,
 * and the ft_channel/lt_channel label layer.
 */
export const CLASSIFIER_VERSION = '1.2.0' as const;

// --- first-touch attributes -------------------------------------------------

export const ATTR_FIRST_SOURCE = 'attribution.first.source' as const;
export const ATTR_FIRST_MEDIUM = 'attribution.first.medium' as const;
export const ATTR_FIRST_CAMPAIGN = 'attribution.first.campaign' as const;
export const ATTR_FIRST_TERM = 'attribution.first.term' as const;
export const ATTR_FIRST_CONTENT = 'attribution.first.content' as const;
export const ATTR_FIRST_UTM_ID = 'attribution.first.utm_id' as const;
export const ATTR_FIRST_REFERRER = 'attribution.first.referrer' as const;
export const ATTR_FIRST_LANDING_PAGE = 'attribution.first.landing_page' as const;
export const ATTR_FIRST_TOUCH_TIMESTAMP = 'attribution.first.touch_timestamp' as const;

// --- last-touch attributes --------------------------------------------------

export const ATTR_LAST_SOURCE = 'attribution.last.source' as const;
export const ATTR_LAST_MEDIUM = 'attribution.last.medium' as const;
export const ATTR_LAST_CAMPAIGN = 'attribution.last.campaign' as const;
export const ATTR_LAST_TERM = 'attribution.last.term' as const;
export const ATTR_LAST_CONTENT = 'attribution.last.content' as const;
export const ATTR_LAST_UTM_ID = 'attribution.last.utm_id' as const;
export const ATTR_LAST_REFERRER = 'attribution.last.referrer' as const;
export const ATTR_LAST_LANDING_PAGE = 'attribution.last.landing_page' as const;
export const ATTR_LAST_TOUCH_TIMESTAMP = 'attribution.last.touch_timestamp' as const;

// --- extended UTM attributes (stable; part of the canonical payload) --------

export const ATTR_FIRST_UTM_SOURCE_PLATFORM = 'attribution.first.utm_source_platform' as const;
export const ATTR_FIRST_UTM_CREATIVE_FORMAT = 'attribution.first.utm_creative_format' as const;
export const ATTR_FIRST_UTM_MARKETING_TACTIC = 'attribution.first.utm_marketing_tactic' as const;
export const ATTR_LAST_UTM_SOURCE_PLATFORM = 'attribution.last.utm_source_platform' as const;
export const ATTR_LAST_UTM_CREATIVE_FORMAT = 'attribution.last.utm_creative_format' as const;
export const ATTR_LAST_UTM_MARKETING_TACTIC = 'attribution.last.utm_marketing_tactic' as const;

// --- ad click IDs ------------------------------------------------------------

export const ATTR_AD_CLICK_ID_GCLID = 'ad.click_id.gclid' as const;
export const ATTR_AD_CLICK_ID_WBRAID = 'ad.click_id.wbraid' as const;
export const ATTR_AD_CLICK_ID_GBRAID = 'ad.click_id.gbraid' as const;
export const ATTR_AD_CLICK_ID_FBCLID = 'ad.click_id.fbclid' as const;
export const ATTR_AD_CLICK_ID_TTCLID = 'ad.click_id.ttclid' as const;
export const ATTR_AD_CLICK_ID_MSCLKID = 'ad.click_id.msclkid' as const;
export const ATTR_AD_CLICK_ID_TWCLID = 'ad.click_id.twclid' as const;
export const ATTR_AD_CLICK_ID_LI_FAT_ID = 'ad.click_id.li_fat_id' as const;
export const ATTR_AD_CLICK_ID_SCCID = 'ad.click_id.sccid' as const;
export const ATTR_AD_CLICK_ID_EPIK = 'ad.click_id.epik' as const;

// --- browser/platform identifiers (captured only when consent allows) -------

export const ATTR_BROWSER_ID_FBC = 'browser.identifier.fbc' as const;
export const ATTR_BROWSER_ID_FBP = 'browser.identifier.fbp' as const;
export const ATTR_BROWSER_ID_TTP = 'browser.identifier.ttp' as const;
export const ATTR_BROWSER_ID_LI_GC = 'browser.identifier.li_gc' as const;
export const ATTR_BROWSER_ID_GA_CLIENT_ID = 'browser.identifier.ga_client_id' as const;
export const ATTR_BROWSER_ID_GA_SESSION_ID = 'browser.identifier.ga_session_id' as const;
export const ATTR_BROWSER_ID_GA_SESSION_NUMBER = 'browser.identifier.ga_session_number' as const;

// --- identity / session ------------------------------------------------------

export const ATTR_VISITOR_ID = 'visitor.id' as const;
export const ATTR_SESSION_ID = 'session.id' as const;
export const ATTR_SESSION_NUMBER = 'session.number' as const;

// --- channel classification enums -------------------------------------------

export const CHANNEL_VALUE_PAID_SEARCH = 'paid_search' as const;
export const CHANNEL_VALUE_PAID_SOCIAL = 'paid_social' as const;
export const CHANNEL_VALUE_PAID_OTHER = 'paid_other' as const;
export const CHANNEL_VALUE_ORGANIC_SEARCH = 'organic_search' as const;
export const CHANNEL_VALUE_ORGANIC_SOCIAL = 'organic_social' as const;
export const CHANNEL_VALUE_REFERRAL = 'referral' as const;
export const CHANNEL_VALUE_DIRECT = 'direct' as const;
export const CHANNEL_VALUE_EMAIL = 'email' as const;
export const CHANNEL_VALUE_AFFILIATE = 'affiliate' as const;
export const CHANNEL_VALUE_UNKNOWN = 'unknown' as const;

export type Channel =
  | typeof CHANNEL_VALUE_PAID_SEARCH
  | typeof CHANNEL_VALUE_PAID_SOCIAL
  | typeof CHANNEL_VALUE_PAID_OTHER
  | typeof CHANNEL_VALUE_ORGANIC_SEARCH
  | typeof CHANNEL_VALUE_ORGANIC_SOCIAL
  | typeof CHANNEL_VALUE_REFERRAL
  | typeof CHANNEL_VALUE_DIRECT
  | typeof CHANNEL_VALUE_EMAIL
  | typeof CHANNEL_VALUE_AFFILIATE
  | typeof CHANNEL_VALUE_UNKNOWN;

// --- events -------------------------------------------------------------------

export const EVENT_PAGE_VIEW = 'page_view' as const;
export const EVENT_FORM_STARTED = 'form_started' as const;
export const EVENT_LEAD_CREATED = 'lead_created' as const;
export const EVENT_LEAD_QUALIFIED = 'lead_qualified' as const;
export const EVENT_BOOKING_CREATED = 'booking_created' as const;
export const EVENT_BOOKING_COMPLETED = 'booking_completed' as const;
export const EVENT_SALE = 'sale' as const;
export const EVENT_REFUND = 'refund' as const;
export const EVENT_CONSENT_UPDATED = 'consent_updated' as const;

/** @deprecated Use EVENT_LEAD_CREATED. */
export const EVENT_LEAD_SUBMITTED = EVENT_LEAD_CREATED;
/** @deprecated Use EVENT_BOOKING_CREATED. */
export const EVENT_APPOINTMENT_BOOKED = EVENT_BOOKING_CREATED;
/** @deprecated Use EVENT_BOOKING_COMPLETED. */
export const EVENT_APPOINTMENT_ATTENDED = EVENT_BOOKING_COMPLETED;
/** @deprecated Use EVENT_SALE. */
export const EVENT_SALE_COMPLETED = EVENT_SALE;
/** @deprecated Use EVENT_REFUND. */
export const EVENT_SALE_REFUNDED = EVENT_REFUND;
