import {
  mergeMetaWhatsAppReferralAttributes,
  META_WHATSAPP_REFERRAL_ATTRIBUTE_PREFIX,
  META_WHATSAPP_REFERRAL_FIELDS,
  normalizeMetaWhatsAppReferral,
} from './referral.js';

const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Preserve existing Chatwoot contact attributes and map local attribution.
 *
 * The referral path is opt-in and accepts only `attribution.referral`, which
 * should be extracted by the host from Chatwoot's message-level
 * `content_attributes.referral`. It never promotes every message itself.
 */
export function enrichContact(contact = {}, attribution = {}, options = {}) {
  const contactRecord = isRecord(contact) ? contact : {};
  const attrs = isRecord(contactRecord.custom_attributes) ? { ...contactRecord.custom_attributes } : {};
  const source = isRecord(attribution) ? attribution : {};

  for (const key of CLICK_ID_KEYS) {
    if (source[key]) attrs[`clicktrail_${key}`] = String(source[key]).slice(0, 512);
  }

  const consentState = options?.consentState;
  return {
    ...contactRecord,
    custom_attributes: mergeMetaWhatsAppReferralAttributes(
      attrs,
      source.referral,
      { consentState },
    ),
  };
}

export {
  META_WHATSAPP_REFERRAL_ATTRIBUTE_PREFIX,
  META_WHATSAPP_REFERRAL_FIELDS,
  normalizeMetaWhatsAppReferral,
};
