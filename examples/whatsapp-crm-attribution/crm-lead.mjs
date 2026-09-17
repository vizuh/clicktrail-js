import { HANDOFF_DESTINATION, HANDOFF_ID_PATTERN } from './create-handoff.mjs';

export const DEFAULT_CONTRACT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const MAX_CONTRACT_RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Attach once. Existing attribution is never replaced, including when the
 * incoming handoff belongs to a later touch or a returning contact.
 */
export function attachHandoffToLead(lead, handoff) {
  const next = isRecord(lead) ? { ...lead } : {};
  const existing = typeof next.attribution_id === 'string' ? next.attribution_id.trim() : '';
  if (existing) {
    return {
      status: existing === handoff?.id ? 'already_attached' : 'preserved_existing',
      attributionId: existing,
      lead: next,
    };
  }
  if (!HANDOFF_ID_PATTERN.test(handoff?.id || '')) {
    return { status: 'unattributed', attributionId: null, lead: next };
  }
  next.attribution_id = handoff.id;
  return { status: 'attached', attributionId: handoff.id, lead: next };
}

function validDate(value, field) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Retain the resolved snapshot under the durable CRM attribution ID. The
 * store must insert by ID and reject conflicting replacements.
 */
export async function retainHandoffForContract({
  handoff,
  leadId,
  now,
  retentionMs = DEFAULT_CONTRACT_RETENTION_MS,
} = {}, store) {
  if (!handoff || !HANDOFF_ID_PATTERN.test(handoff.id || '') || handoff.destination !== HANDOFF_DESTINATION) {
    return { status: 'not_retained', reason: 'handoff_invalid' };
  }
  if (typeof leadId !== 'string' || leadId.trim() === '') {
    return { status: 'not_retained', reason: 'lead_id_required' };
  }
  if (!store || typeof store.putById !== 'function') {
    throw new TypeError('handoff store must implement putById(record)');
  }
  if (!Number.isInteger(retentionMs) || retentionMs < 1 || retentionMs > MAX_CONTRACT_RETENTION_MS) {
    throw new RangeError(`retentionMs must be an integer from 1 through ${MAX_CONTRACT_RETENTION_MS}`);
  }
  const retainedAt = validDate(now, 'now');
  const retainedUntil = new Date(retainedAt.getTime() + retentionMs);
  const record = {
    version: 1,
    kind: 'contract_snapshot',
    id: handoff.id,
    destination: HANDOFF_DESTINATION,
    leadId: leadId.trim().slice(0, 256),
    createdAt: handoff.createdAt,
    codeExpiresAt: handoff.expiresAt,
    retainedAt: retainedAt.toISOString(),
    retainedUntil: retainedUntil.toISOString(),
    consent: clone(handoff.consent),
    identity: clone(handoff.identity),
  };
  await store.putById(record);
  return { status: 'retained', id: record.id, retainedUntil: record.retainedUntil };
}
