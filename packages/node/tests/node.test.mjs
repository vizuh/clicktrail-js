import test from 'node:test'; import assert from 'node:assert/strict'; import { attachClickIds, getClickIds, idempotencyKey } from '../src/index.js';
test('extracts allowlisted IDs from a request', () => assert.deepEqual(getClickIds({ url: 'https://x.test/?gclid=a&evil=b' }), { gclid: 'a' }));
test('attaches bounded attribution', () => assert.equal(attachClickIds({ id: 1 }, { fbclid: 'f' }).attribution.fbclid, 'f'));
test('keeps the established idempotency key shape for simple provider IDs', () => assert.equal(idempotencyKey('stripe', 'cs_1'), 'stripe:cs_1:conversion'));
test('does not collide when idempotency components contain delimiters', () => {
  assert.notEqual(idempotencyKey('a:b', 'c'), idempotencyKey('a', 'b:c'));
  assert.notEqual(idempotencyKey('order/a', 'c'), idempotencyKey('order?a', 'c'));
});
