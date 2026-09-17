import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWhatsAppHandoff, createWhatsAppLink } from './browser.mjs';
import { createHandoff } from './create-handoff.mjs';
import { resolveHandoff } from './resolve-handoff.mjs';
import { extractHandoffCode, whatsappUrl } from './whatsapp-link.mjs';
import { attachHandoffToLead } from './crm-lead.mjs';
import { buildSignedContractInput, recordSignedContract, signedContractEventId } from './conversion.mjs';

function store() {
  const records = new Map();
  return {
    records,
    async put(record) { records.set(record.codeHash, structuredClone(record)); },
    async getByCodeHash(codeHash) { return records.get(codeHash) ? structuredClone(records.get(codeHash)) : null; },
  };
}

const identity = {
  payload: {
    ft_source: 'google',
    ft_medium: 'cpc',
    ft_landing_page: 'https://example.test/?gclid=secret',
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

test('derives a stable contract event ID and keeps unsigned contracts inert', async () => {
  const handoff = { id: 'hnd_aaaaaaaaaaaaaaaaaaaaaaaa', consent: consentState, identity: { payload: { gclid: 'secret' } } };
  const contract = { id: 'contract-42', status: 'signed', value: 120, currency: 'eur' };
  const prepared = buildSignedContractInput({ handoff, contract });
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.eventId, signedContractEventId('contract-42'));
  assert.equal(buildSignedContractInput({ handoff, contract: { ...contract, status: 'draft' } }).status, 'not_recorded');
  assert.equal(buildSignedContractInput({ handoff: { identity: handoff.identity, consent: { marketing: false, advertising: false } }, contract }).reason, 'consent_missing');

  const calls = [];
  const server = { async trackPurchase(input) { calls.push(input); return { ok: true, status: 204 }; } };
  const first = await recordSignedContract({ server, handoff, contract });
  const retry = await recordSignedContract({ server, handoff, contract });
  assert.equal(first.status, 'collector_attempted');
  assert.equal(retry.eventId, first.eventId);
  assert.equal(calls[0].eventId, calls[1].eventId);
});
