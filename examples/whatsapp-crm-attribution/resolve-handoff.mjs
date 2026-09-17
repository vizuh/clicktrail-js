import {
  HANDOFF_DESTINATION,
  HANDOFF_ID_PATTERN,
  hashHandoffCode,
  normalizeHandoffCode,
} from './create-handoff.mjs';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validExpiry(value, now) {
  if (typeof value !== 'string') return false;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && now.getTime() < expiresAt;
}

/**
 * Resolve without consuming the record. Repeated CRM retries return the same
 * immutable snapshot; the host still owns rate limiting and access control.
 */
export async function resolveHandoff({
  code,
  destination = HANDOFF_DESTINATION,
  now,
} = {}, store) {
  const normalized = normalizeHandoffCode(code);
  if (!normalized || destination !== HANDOFF_DESTINATION || !store || typeof store.getByCodeHash !== 'function') {
    return null;
  }
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  if (Number.isNaN(current.getTime())) return null;

  const codeHash = hashHandoffCode(normalized);
  const record = await store.getByCodeHash(codeHash);
  if (!isRecord(record) || record.version !== 1 || record.codeHash !== codeHash) return null;
  if (record.destination !== HANDOFF_DESTINATION || !validExpiry(record.expiresAt, current)) return null;
  if (!isRecord(record.identity) || !isRecord(record.consent)) return null;

  return {
    id: record.id,
    destination: record.destination,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consent: clone(record.consent),
    identity: clone(record.identity),
  };
}

/**
 * Resolve the durable snapshot retained at CRM lead attachment. This lookup
 * intentionally does not use the short-lived WhatsApp code, so a later signed
 * contract can still be attributed after the message code expires.
 */
export async function resolveHandoffForContract({ id, now } = {}, store) {
  if (typeof id !== 'string' || !HANDOFF_ID_PATTERN.test(id) || !store || typeof store.getById !== 'function') {
    return null;
  }
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  if (Number.isNaN(current.getTime())) return null;

  const record = await store.getById(id);
  if (!isRecord(record) || record.version !== 1 || record.kind !== 'contract_snapshot' || record.id !== id) return null;
  if (record.destination !== HANDOFF_DESTINATION || !validExpiry(record.retainedUntil, current)) return null;
  if (!isRecord(record.identity) || !isRecord(record.consent)) return null;

  return {
    id: record.id,
    destination: record.destination,
    createdAt: record.createdAt,
    expiresAt: record.codeExpiresAt,
    retainedUntil: record.retainedUntil,
    consent: clone(record.consent),
    identity: clone(record.identity),
  };
}
