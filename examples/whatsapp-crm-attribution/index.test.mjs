import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWhatsAppHandoff, createWhatsAppLink } from './browser.mjs';
import { createHandoff } from './create-handoff.mjs';
import { resolveHandoff, resolveHandoffForContract } from './resolve-handoff.mjs';
import { extractHandoffCode, whatsappUrl } from './whatsapp-link.mjs';
import { attachHandoffToLead, retainHandoffForContract } from './crm-lead.mjs';
import { buildSignedContractInput, recordSignedContract, signedContractEventId } from './conversion.mjs';

function store() {
  const records = new Map();
  const recordsById = new Map();
  return {
    records,
    recordsById,
    async put(record) { records.set(record.codeHash, structuredClone(record)); },
    async getByCodeHash(codeHash) { return records.get(codeHash) ? structuredClone(records.get(codeHash)) : null; },
    async putById(record) { recordsById.set(record.id, structuredClone(record)); },
    async getById(id) { return recordsById.get(id) ? structuredClone(recordsById.get(id)) : null; },
  };
}

const identity = {
  payload: {
    ft_source: 'google',
    ft_medium: 'cpc',
    ft_landing_page: 'https://example.test/?gclid=secret',
    ft_gclid: 'first-google',
    lt_gclid: 'latest-google',
    gclid: 'secret',
    fbclid: 'meta-secret',
    visitor_id: 'must-not-be-copied',
    arbitrary: 'must-not-be-copied',
  },
  visitorId: 'visitor-1',
  sessionId: 'session-1',
  sessionNumber: 2,
};
const consentState = { analytics: true, advertising: true, marketing: true };

function fixedBytes() {
  return Uint8Array.from({ length: 10 }, (_, index) => index + 1);
}

async function createdHandoff(options = {}) {
  const handoffs = store();
  const result = await createHandoff({
    identity,
    consentState,
    now: new Date('2026-09-17T00:00:00.000Z'),
    randomBytes: fixedBytes,
    ...options,
  }, handoffs);
  return { result, handoffs };
}

test('requires consent and leaves no store record when denied', async () => {
  const handoffs = store();
  const result = await createHandoff({ identity, consentState: { analytics: true } }, handoffs);
  assert.deepEqual(result, { status: 'not_created', reason: 'consent_required' });
  assert.equal(handoffs.records.size, 0);
});

test('creates an opaque code and bounded immutable snapshot', async () => {
  const { result, handoffs } = await createdHandoff();
  assert.equal(result.status, 'created');
  assert.match(result.handoff.code, /^CT-[0-9A-F]{20}$/);
  assert.equal(handoffs.records.size, 1);
  const record = [...handoffs.records.values()][0];
  assert.equal(record.code, undefined);
  assert.equal(record.identity.payload.arbitrary, undefined);
  assert.equal(record.identity.payload.visitor_id, undefined);
  assert.equal(record.identity.payload.gclid, 'secret');
  assert.equal(record.identity.payload.fbclid, 'meta-secret');
  assert.equal(record.identity.payload.ft_gclid, 'first-google');
  assert.equal(record.identity.payload.lt_gclid, 'latest-google');
});

test('bounds click history to complete JSON entries and keeps the newest touch IDs', async () => {
  const history = JSON.stringify(Array.from({ length: 50 }, (_, index) => ({
    k: 'gclid',
    v: `click-${index}-${'x'.repeat(24)}`,
    t: `2026-09-17T00:${String(index).padStart(2, '0')}:00.000Z`,
  })));
  const { handoffs } = await createdHandoff({ identity: { ...identity, payload: { ...identity.payload, click_id_history: history } } });
  const record = [...handoffs.records.values()][0];
  const bounded = record.identity.payload.click_id_history;
  assert.ok(bounded.length <= 512);
  const parsed = JSON.parse(bounded);
  assert.equal(parsed.at(-1).v, 'click-49-' + 'x'.repeat(24));
  assert.ok(parsed.length < 50);
});

test('expires codes and permits idempotent repeated resolution before expiry', async () => {
  const { result, handoffs } = await createdHandoff({ ttlMs: 60_000 });
  const first = await resolveHandoff({ code: result.handoff.code, now: new Date('2026-09-17T00:00:30.000Z') }, handoffs);
  const second = await resolveHandoff({ code: result.handoff.code.toLowerCase(), now: new Date('2026-09-17T00:00:30.000Z') }, handoffs);
  assert.deepEqual(second, first);
  assert.equal(await resolveHandoff({ code: result.handoff.code, now: new Date('2026-09-17T00:01:00.000Z') }, handoffs), null);
});

test('keeps attribution out of WhatsApp and handles a removed code', async () => {
  const { result } = await createdHandoff();
  const link = whatsappUrl({ phone: '+351912345678', message: 'Olá, quero saber mais.', handoffCode: result.handoff.code });
  assert.match(link, /^https:\/\/wa\.me\/351912345678\?text=/);
  assert.equal(decodeURIComponent(link.split('?text=')[1]).includes('secret'), false);
  assert.equal(extractHandoffCode(decodeURIComponent(link)), result.handoff.code);
  assert.equal(extractHandoffCode('Olá, quero saber mais.'), null);
});

test('browser request sends only destination after ClickTrail has started', async () => {
  let request;
  const result = await requestWhatsAppHandoff({
    consentState,
    clicktrail: { isStarted: () => true },
    fetchImpl: async (_url, options) => {
      request = options;
      return { ok: true, async json() { return { status: 'created', handoff: { id: 'hnd_1234567890abcdef12345678', code: 'CT-0102030405060708090A', destination: 'whatsapp', expiresAt: '2026-09-18T00:00:00.000Z' } }; } };
    },
  });
  assert.equal(result.status, 'created');
  assert.deepEqual(JSON.parse(request.body), { destination: 'whatsapp' });
  assert.equal(request.credentials, 'same-origin');
});

test('rejects cross-origin absolute handoff endpoints', async () => {
  let called = false;
  const result = await requestWhatsAppHandoff({
    endpoint: 'https://handoff.example.test/api/whatsapp-handoff',
    consentState,
    fetchImpl: async () => { called = true; return { ok: true, async json() { return {}; } }; },
  });
  assert.deepEqual(result, { status: 'not_created', reason: 'invalid_endpoint' });
  assert.equal(called, false);
});

test('falls back to a direct WhatsApp link without consent', async () => {
  const result = await createWhatsAppLink({ phone: '+351912345678', message: 'Olá', consentState: { marketing: false } });
  assert.equal(result.status, 'not_created');
  assert.equal(decodeURIComponent(result.url).includes('CT-'), false);
});

test('preserves an existing CRM first-touch attribution ID', () => {
  const handoff = { id: 'hnd_aaaaaaaaaaaaaaaaaaaaaaaa' };
  const first = attachHandoffToLead({ phone: '+351912345678' }, handoff);
  assert.equal(first.status, 'attached');
  const later = attachHandoffToLead({ ...first.lead }, { id: 'hnd_bbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(later.status, 'preserved_existing');
  assert.equal(later.lead.attribution_id, handoff.id);
});

test('retains a durable snapshot for delayed contract conversion', async () => {
  const { result, handoffs } = await createdHandoff({ ttlMs: 60_000 });
  const resolved = await resolveHandoff({ code: result.handoff.code, now: new Date('2026-09-17T00:00:30.000Z') }, handoffs);
  const retained = await retainHandoffForContract({
    handoff: resolved,
    leadId: 'lead-42',
    now: new Date('2026-09-17T00:00:30.000Z'),
    retentionMs: 86_400_000,
  }, handoffs);
  assert.equal(retained.status, 'retained');
  assert.ok(await resolveHandoffForContract({ id: result.handoff.id, now: new Date('2026-09-17T00:02:00.000Z') }, handoffs));

  const calls = [];
  const server = { async trackPurchase(input) { calls.push(input); return { ok: true, status: 204 }; } };
  const contract = { id: 'contract-delayed', status: 'signed', signedAt: '2026-09-17T00:02:00.000Z', value: 120, currency: 'eur' };
  const recorded = await recordSignedContract({ server, handoffId: result.handoff.id, handoffStore: handoffs, contract });
  assert.equal(recorded.status, 'collector_attempted');
  assert.equal(calls[0].identity.payload.gclid, 'secret');
  assert.equal(calls[0].now, contract.signedAt);
});

test('derives a stable contract event ID and keeps unsigned contracts inert', async () => {
  const handoff = { id: 'hnd_aaaaaaaaaaaaaaaaaaaaaaaa', consent: consentState, identity: { payload: { gclid: 'secret' } } };
  const contract = { id: 'contract-42', status: 'signed', signedAt: '2026-09-17T00:00:00.000Z', value: 120, currency: 'eur' };
  const prepared = buildSignedContractInput({ handoff, contract });
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.eventId, signedContractEventId('contract-42'));
  assert.equal(prepared.input.now, contract.signedAt);
  assert.equal(buildSignedContractInput({ handoff, contract: { ...contract, status: 'draft' } }).status, 'not_recorded');
  assert.equal(buildSignedContractInput({ handoff: { identity: handoff.identity, consent: { marketing: false, advertising: false } }, contract }).reason, 'consent_missing');
  assert.equal(buildSignedContractInput({ handoff, contract: { ...contract, signedAt: undefined } }).reason, 'signed_timestamp_invalid');

  const calls = [];
  const server = { async trackPurchase(input) { calls.push(input); return { ok: true, status: 204 }; } };
  const first = await recordSignedContract({ server, handoff, contract });
  const retry = await recordSignedContract({ server, handoff, contract });
  assert.equal(first.status, 'collector_attempted');
  assert.equal(retry.eventId, first.eventId);
  assert.equal(calls[0].eventId, calls[1].eventId);
  assert.equal(calls[0].now, calls[1].now);
});
