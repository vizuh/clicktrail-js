import { createHash } from 'node:crypto';
import { resolveHandoffForContract } from './resolve-handoff.mjs';

const CONTRACT_ID_MAX_LENGTH = 256;

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be non-empty`);
  return value.trim();
}

function normalizeSignedTimestamp(value) {
  const text = requiredText(value, 'contract.signedAt');
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new TypeError('contract.signedAt must be a valid date');
  return date.toISOString();
}

/** Stable, non-PII event ID reused by every signed-contract retry. */
export function signedContractEventId(contractId) {
  const id = requiredText(contractId, 'contract.id');
  if (id.length > CONTRACT_ID_MAX_LENGTH) throw new TypeError('contract.id is too long');
  const digest = createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 24);
  return `evt_contract_${digest}`;
}

export function buildSignedContractInput({ handoff, contract } = {}) {
  if (contract?.status !== 'signed') return { status: 'not_recorded', reason: 'contract_not_signed' };
  let signedAt;
  try {
    signedAt = normalizeSignedTimestamp(contract.signedAt);
  } catch {
    return { status: 'not_recorded', reason: 'signed_timestamp_invalid' };
  }
  if (!handoff?.identity) return { status: 'not_recorded', reason: 'handoff_not_resolved' };
  if (!handoff?.consent || (handoff.consent.marketing !== true && handoff.consent.advertising !== true)) {
    return { status: 'not_recorded', reason: 'consent_missing' };
  }
  const id = requiredText(contract.id, 'contract.id');
  const value = contract.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError('contract.value must be a positive finite number');
  }
  const currency = requiredText(contract.currency, 'contract.currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('contract.currency must be a three-letter code');

  return {
    status: 'ready',
    eventId: signedContractEventId(id),
    input: {
      identity: handoff.identity,
      eventId: signedContractEventId(id),
      now: signedAt,
      data: {
        transactionId: id,
        orderId: id,
        value,
        currency,
        consent: handoff.consent,
      },
    },
  };
}

/**
 * Send a provider-neutral sale event through the host's ClickTrailServer.
 * `result` is a collector response, not proof of ad-platform acceptance.
 */
export async function recordSignedContract({
  server,
  handoff,
  handoffId,
  handoffStore,
  contract,
} = {}) {
  let resolvedHandoff = handoff;
  if (!resolvedHandoff && handoffId !== undefined && contract?.status === 'signed') {
    let signedAt;
    try {
      signedAt = normalizeSignedTimestamp(contract.signedAt);
    } catch {
      return { status: 'not_recorded', reason: 'signed_timestamp_invalid' };
    }
    resolvedHandoff = await resolveHandoffForContract({ id: handoffId, now: signedAt }, handoffStore);
  }
  const prepared = buildSignedContractInput({ handoff: resolvedHandoff, contract });
  if (prepared.status !== 'ready') return prepared;
  if (!server || typeof server.trackPurchase !== 'function') {
    return { status: 'not_recorded', reason: 'server_client_missing' };
  }
  const result = await server.trackPurchase(prepared.input);
  return { status: 'collector_attempted', eventId: prepared.eventId, result };
}
