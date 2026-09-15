// Copy-only reference adapter. Keep provider parsing and persistence in the host.
export const REFERRAL_FIELDS = Object.freeze([
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

const NAMESPACE = 'meta_whatsapp_referral';
const MAX_LENGTH = 512;
const STRONG_SIGNAL_FIELDS = ['source_url', 'source_id', 'ctwa_clid'];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedString = (value) => {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, MAX_LENGTH) : '';
};

export function normalizeMetaWhatsAppReferral(input) {
  if (!isRecord(input)) return null;

  const normalized = {};
  for (const key of REFERRAL_FIELDS) {
    if (key === 'welcome_message_text') continue;
    const value = boundedString(input[key]);
    if (value) normalized[key] = value;
  }

  const welcome = isRecord(input.welcome_message) ? boundedString(input.welcome_message.text) : '';
  const explicitWelcome = boundedString(input.welcome_message_text);
  if (explicitWelcome || welcome) normalized.welcome_message_text = explicitWelcome || welcome;

  if (!STRONG_SIGNAL_FIELDS.some((key) => normalized[key])) return null;
  return normalized;
}

/**
 * Host-selected, consent-gated, first-snapshot-wins context merge.
 *
 * `attribution` must be `{ referral: <normalized referral> }`. Do not pass a
 * raw webhook/message object. No CRM or provider call is made here.
 */
export function enrichOpenMercatoContext(context = {}, attribution = {}, options = {}) {
  const base = isRecord(context) ? { ...context } : {};
  const source = isRecord(attribution) ? attribution : {};
  if (options?.consentState !== 'granted') return base;

  const referral = normalizeMetaWhatsAppReferral(source.referral);
  if (!referral) return base;
  if (isRecord(base[NAMESPACE]) && Object.keys(base[NAMESPACE]).length > 0) return base;

  return { ...base, [NAMESPACE]: referral };
}
