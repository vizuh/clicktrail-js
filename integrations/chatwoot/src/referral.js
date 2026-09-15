/**
 * Fixed, provider-specific allowlist for Meta/WhatsApp referral metadata.
 *
 * Values are observed provider context, not proof of a click or conversion.
 * `welcome_message_text` is derived from the one explicitly allowed nested
 * field `welcome_message.text`; no arbitrary nested object is accepted.
 */
export const META_WHATSAPP_REFERRAL_FIELDS = Object.freeze([
  'source_url',
  'source_id',
  'source_type',
  'headline',
  'body',
  'media_type',
  'image_url',
  'video_url',
  'thumbnail_url',
  'ctwa_clid',
  'media_id',
  'media_content_type',
  'media_url',
  'num_media',
  'welcome_message_text',
]);

export const META_WHATSAPP_REFERRAL_NAMESPACE = 'meta_whatsapp_referral';
export const META_WHATSAPP_REFERRAL_ATTRIBUTE_PREFIX = 'clicktrail_referral_';
export const META_WHATSAPP_REFERRAL_MAX_LENGTH = 512;

const STRONG_SIGNAL_FIELDS = Object.freeze(['source_url', 'source_id', 'ctwa_clid']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, META_WHATSAPP_REFERRAL_MAX_LENGTH) : '';
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Normalize an already extracted Meta/WhatsApp referral object.
 *
 * This is deliberately not a raw webhook parser. The host chooses the
 * provider boundary and passes only its normalized referral object here.
 * Returns null when there is no strong referral signal.
 */
export function normalizeMetaWhatsAppReferral(input) {
  if (!isRecord(input)) return null;

  const normalized = {};
  for (const key of META_WHATSAPP_REFERRAL_FIELDS) {
    if (key === 'welcome_message_text') continue;
    const value = boundedString(input[key]);
    if (value) normalized[key] = value;
  }

  const welcomeMessage = isRecord(input.welcome_message) ? input.welcome_message : null;
  const explicitWelcomeText = boundedString(input.welcome_message_text);
  const welcomeText = explicitWelcomeText || boundedString(welcomeMessage?.text);
  if (welcomeText) normalized.welcome_message_text = welcomeText;

  if (!STRONG_SIGNAL_FIELDS.some((key) => hasValue(normalized[key]))) return null;
  return normalized;
}

/** Build the namespaced context shape consumed by host adapters. */
export function buildMetaWhatsAppAcquisitionContext(referral) {
  const normalized = normalizeMetaWhatsAppReferral(referral);
  return normalized ? { [META_WHATSAPP_REFERRAL_NAMESPACE]: normalized } : {};
}

/**
 * Merge a referral into a host-owned context object.
 *
 * The merge is immutable, allowlisted, deterministic, consent-gated, and
 * atomic first-snapshot-wins. Existing context and unknown existing keys are
 * preserved; unknown incoming keys never cross the adapter boundary.
 */
export function mergeMetaWhatsAppAcquisitionContext(
  existing,
  referral,
  options = {},
) {
  const base = isRecord(existing) ? { ...existing } : {};
  if (options?.consentState !== 'granted') return base;

  const normalized = normalizeMetaWhatsAppReferral(referral);
  if (!normalized) return base;

  const previous = base[META_WHATSAPP_REFERRAL_NAMESPACE];
  if (isRecord(previous) && Object.keys(previous).length > 0) return base;

  return {
    ...base,
    [META_WHATSAPP_REFERRAL_NAMESPACE]: normalized,
  };
}

/** Flatten a normalized referral for systems with flat custom attributes. */
export function metaWhatsAppReferralAttributes(referral) {
  const normalized = normalizeMetaWhatsAppReferral(referral);
  if (!normalized) return {};

  const attributes = {};
  for (const key of META_WHATSAPP_REFERRAL_FIELDS) {
    if (normalized[key]) attributes[`${META_WHATSAPP_REFERRAL_ATTRIBUTE_PREFIX}${key}`] = normalized[key];
  }
  return attributes;
}

/**
 * Merge a referral into flat custom attributes using the same atomic
 * first-snapshot-wins and allowlist rules as the nested context helper.
 */
export function mergeMetaWhatsAppReferralAttributes(
  existing,
  referral,
  options = {},
) {
  const base = isRecord(existing) ? { ...existing } : {};
  if (options?.consentState !== 'granted') return base;

  const candidate = metaWhatsAppReferralAttributes(referral);
  const hasExistingReferral = META_WHATSAPP_REFERRAL_FIELDS.some(
    (key) => Object.prototype.hasOwnProperty.call(
      base,
      `${META_WHATSAPP_REFERRAL_ATTRIBUTE_PREFIX}${key}`,
    ),
  );
  if (hasExistingReferral) return base;

  return { ...base, ...candidate };
}
