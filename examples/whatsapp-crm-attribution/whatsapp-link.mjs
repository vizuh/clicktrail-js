import { HANDOFF_CODE_PATTERN, normalizeHandoffCode } from './create-handoff.mjs';

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const MAX_MESSAGE_LENGTH = 4096;

export function normalizeWhatsAppPhone(value) {
  if (typeof value !== 'string') throw new TypeError('phone must be an E.164 string');
  const phone = value.trim();
  if (!PHONE_PATTERN.test(phone)) throw new TypeError('phone must be an E.164 string');
  return phone.slice(1);
}

export function extractHandoffCode(value) {
  if (typeof value !== 'string') return null;
  const match = value.toUpperCase().match(/\bCT-[0-9A-F]{20}\b/);
  return match && HANDOFF_CODE_PATTERN.test(match[0]) ? match[0] : null;
}

/** Build a wa.me link without putting attribution values into the message. */
export function whatsappUrl({ phone, message = '', handoffCode } = {}) {
  const digits = normalizeWhatsAppPhone(phone);
  if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
    throw new TypeError(`message must be a string of at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  let code;
  if (handoffCode !== undefined) {
    code = normalizeHandoffCode(handoffCode);
    if (!code) throw new TypeError('handoffCode is invalid');
  }
  const text = [message.trim(), code ? `Ref: ${code}` : ''].filter(Boolean).join(' ');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
