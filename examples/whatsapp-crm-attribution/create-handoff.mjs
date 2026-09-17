import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';

export const HANDOFF_DESTINATION = 'whatsapp';
export const DEFAULT_HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_HANDOFF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDOFF_CODE_PATTERN = /^CT-[0-9A-F]{20}$/;

const MAX_FIELD_LENGTH = 512;
const CLICK_ID_KEYS = [
  'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid', 'twclid',
  'li_fat_id', 'sccid', 'epik', 'fbc', 'fbp', 'ttp', 'li_gc',
  'ga_client_id', 'ga_session_id', 'ga_session_number',
];
const TOUCH_FIELDS = [
  'source', 'medium', 'campaign', 'term', 'content', 'utm_id',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'channel', 'referrer', 'landing_page', 'touch_timestamp',
];
const SAFE_PAYLOAD_KEYS = new Set([
  ...CLICK_ID_KEYS,
  'click_id_history',
  'attribution_selected_click_id',
  'attribution_selected_click_id_reason',
  'trail_id',
  'schema_version',
  'classifier_version',
  ...TOUCH_FIELDS.flatMap((field) => [`ft_${field}`, `lt_${field}`]),
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value) => typeof value === 'string' && value.trim() !== ''
  ? value.trim().slice(0, MAX_FIELD_LENGTH)
  : '';

export function normalizeHandoffCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return HANDOFF_CODE_PATTERN.test(code) ? code : null;
}

export function hashHandoffCode(code) {
  const normalized = normalizeHandoffCode(code);
  if (!normalized) throw new TypeError('handoff code is invalid');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function normalizeDate(value, field) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date;
}

function snapshotConsent(consentState) {
  if (!isRecord(consentState)) return null;
  return {
    analytics: consentState.analytics === true,
    advertising: consentState.advertising === true,
    marketing: consentState.marketing === true,
  };
}

function snapshotPayload(payload) {
  if (!isRecord(payload)) return {};
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SAFE_PAYLOAD_KEYS.has(key)) {
      const text = boundedText(value);
      if (text) result[key] = text;
    }
  }
  return result;
}

function snapshotIdentity(identity) {
  const payload = snapshotPayload(identity?.payload);
  return {
    payload,
    ...(boundedText(identity?.visitorId) ? { visitorId: boundedText(identity.visitorId) } : {}),
    ...(boundedText(identity?.sessionId) ? { sessionId: boundedText(identity.sessionId) } : {}),
    ...(Number.isInteger(identity?.sessionNumber) ? { sessionNumber: identity.sessionNumber } : {}),
  };
}

function createCode(randomBytes) {
  const bytes = randomBytes(10);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 10) {
    throw new TypeError('randomBytes must return exactly 10 bytes');
  }
  return `CT-${Buffer.from(bytes).toString('hex').toUpperCase()}`;
}

/**
 * Create an immutable, short-lived handoff record.
 *
 * `store.put(record)` must persist the record by `record.codeHash`; the
 * plaintext code is deliberately not stored. `identity` must come from the
 * host's server-side `parseIdentityFromCookies`, not from request JSON.
 */
export async function createHandoff({
  identity,
  consentState,
  destination = HANDOFF_DESTINATION,
  now,
  ttlMs = DEFAULT_HANDOFF_TTL_MS,
  randomBytes = nodeRandomBytes,
} = {}, store) {
  if (destination !== HANDOFF_DESTINATION) {
    return { status: 'not_created', reason: 'unsupported_destination' };
  }
  const consent = snapshotConsent(consentState);
  if (!consent || (consent.marketing !== true && consent.advertising !== true)) {
    return { status: 'not_created', reason: 'consent_required' };
  }
  if (!store || typeof store.put !== 'function') {
    throw new TypeError('handoff store must implement put(record)');
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_HANDOFF_TTL_MS) {
    throw new RangeError(`ttlMs must be an integer from 1 through ${MAX_HANDOFF_TTL_MS}`);
  }

  const createdAt = normalizeDate(now, 'now');
  const expiresAt = new Date(createdAt.getTime() + ttlMs);
  const snapshot = snapshotIdentity(identity);
  if (Object.keys(snapshot.payload).length === 0) {
    return { status: 'not_created', reason: 'no_attribution' };
  }

  const code = createCode(randomBytes);
  const codeHash = hashHandoffCode(code);
  const record = {
    version: 1,
    id: `hnd_${codeHash.slice(0, 24)}`,
    codeHash,
    destination: HANDOFF_DESTINATION,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    consent,
    identity: snapshot,
  };
  await store.put(record);
  return {
    status: 'created',
    handoff: {
      id: record.id,
      code,
      destination: record.destination,
      expiresAt: record.expiresAt,
    },
  };
}
