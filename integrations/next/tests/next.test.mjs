import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAttribution, captureAttribution, createHiddenFields, parseAttributionCookie, serializeAttributionCookie } from '../src/index.js';

test('captures and bounds allowlisted click IDs', () => assert.deepEqual(captureAttribution('?gclid=abc&fbclid=def&evil=x'), { gclid: 'abc', fbclid: 'def' }));
test('round trips a first-party cookie', () => { const cookie = serializeAttributionCookie({ gclid: 'abc' }); assert.deepEqual(parseAttributionCookie(cookie), { gclid: 'abc' }); });
test('creates hidden form fields only for click IDs', () => assert.deepEqual(createHiddenFields({ gclid: 'abc', tenantId: 'untrusted' }), [{ name: 'gclid', value: 'abc' }]));
test('attaches cookie attribution to form data', async () => { const result = await attachAttribution({ email: 'a@example.test' }, { get: () => ({ value: JSON.stringify({ gclid: 'abc' }) }) }); assert.deepEqual(result.attribution, { gclid: 'abc' }); assert.equal(result.formData.email, 'a@example.test'); });
