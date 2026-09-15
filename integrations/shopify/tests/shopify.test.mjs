import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebPixelScript, extractOrderAttribution, normalizeShopifyOrder } from '../src/index.js';
test('extracts allowlisted attribution from note attributes', () => assert.deepEqual(extractOrderAttribution({ note_attributes: [{ name: 'gclid', value: 'abc' }, { name: 'tenantId', value: 'bad' }] }), { gclid: 'abc' }));
test('normalizes a purchase with stable order ID', () => assert.deepEqual(normalizeShopifyOrder({ id: 7, total_price: '20.00', currency: 'USD', note_attributes: [{ name: 'fbclid', value: 'f' }] }), { eventId: 'shopify_order_7', eventName: 'Purchase', value: 20, currency: 'USD', attribution: { fbclid: 'f' } }));
test('generates a bounded pixel script', () => {
  const script = createWebPixelScript();
  assert.match(script, /analytics\.subscribe/);
  assert.match(script, /gclid/);
  assert.match(script, /browser\.cookie\.set/);
  assert.doesNotMatch(script, /document\.cookie/);
});

test('writes attribution through the Web Pixel browser cookie API', () => {
  const script = createWebPixelScript();
  assert.match(script, /async \(event\)/);
  assert.match(script, /await browser\.cookie\.set\(/);
  assert.match(script, /SameSite=Lax; Secure/);
  assert.doesNotMatch(script, /document\.cookie/);
});
