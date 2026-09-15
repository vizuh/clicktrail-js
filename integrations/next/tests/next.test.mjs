import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachAttribution,
  attachAttributionToAccount,
  captureAttribution,
  captureFirstTouch,
  captureFromNextRequest,
  createHiddenFields,
  createMiddleware,
  parseAttributionCookie,
  serializeAttributionCookie,
} from '../src/index.js';

test('captures and bounds allowlisted click IDs', () => assert.deepEqual(captureAttribution('?gclid=abc&fbclid=def&evil=x'), { gclid: 'abc', fbclid: 'def' }));
test('round trips a first-party cookie', () => { const cookie = serializeAttributionCookie({ gclid: 'abc' }); assert.deepEqual(parseAttributionCookie(cookie), { gclid: 'abc' }); });
test('creates hidden form fields only for click IDs', () => assert.deepEqual(createHiddenFields({ gclid: 'abc', tenantId: 'untrusted' }), [{ name: 'gclid', value: 'abc' }]));
test('attaches cookie attribution to form data', async () => { const result = await attachAttribution({ email: 'a@example.test' }, { get: () => ({ value: JSON.stringify({ gclid: 'abc' }) }) }); assert.deepEqual(result.attribution, { gclid: 'abc' }); assert.equal(result.formData.email, 'a@example.test'); });


test('captures the canonical first touch needed by a signup account', () => {
  const captured = captureFirstTouch(new URL('https://recoupable.dev/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=click-123'), {
    now: '2026-09-01T10:00:00.000Z',
  });
  assert.equal(captured.ft_source, 'google');
  assert.equal(captured.ft_medium, 'cpc');
  assert.equal(captured.ft_campaign, 'spring');
  assert.equal(captured.ft_landing_page, 'https://recoupable.dev/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=click-123');
  assert.equal(captured.ft_gclid, 'click-123');
});

test('captures click IDs from a relative Pages Router URL', () => {
  assert.deepEqual(captureFromNextRequest({ url: '/api/lead?gclid=G-123' }), { gclid: 'G-123' });
});

test('requires affirmative consent before middleware persistence', () => {
  const writes = [];
  const nextResponse = {
    next: () => ({ cookies: { set: (...args) => writes.push(args) } }),
  };
  const middleware = createMiddleware({ nextResponse, now: '2026-09-01T10:00:00.000Z' });
  middleware({ nextUrl: new URL('https://recoupable.dev/?gclid=G-123'), cookies: { get: () => undefined } }, { waitUntil() {} });
  assert.equal(writes.length, 0, 'unknown consent must not persist attribution');
});

test('clears stored attribution when consent is denied', () => {
  const writes = [];
  const nextResponse = {
    next: () => ({ cookies: { set: (...args) => writes.push(args) } }),
  };
  const middleware = createMiddleware({ nextResponse, consentGate: () => false, domain: '.recoupable.dev' });
  middleware({
    nextUrl: new URL('https://recoupable.dev/signup'),
    cookies: { get: () => ({ value: '{"gclid":"old"}' }) },
  }, { waitUntil() {} });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'ct_attribution');
  assert.equal(writes[0][1], '');
  assert.equal(writes[0][2].maxAge, 0);
  assert.equal(writes[0][2].domain, '.recoupable.dev');
});

test('preserves first touch across recoupable.dev and app.recoupable.dev', () => {
  const writes = [];
  const nextResponse = {
    next: () => ({ cookies: { set: (...args) => writes.push(args) } }),
  };
  const middleware = createMiddleware({
    nextResponse,
    consentGate: (request) => request.consent?.advertising === true,
    domain: '.recoupable.dev',
    now: '2026-09-01T10:00:00.000Z',
  });
  const firstRequest = {
    nextUrl: new URL('https://recoupable.dev/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=click-123'),
    consent: { advertising: true },
    cookies: { get: () => undefined },
  };
  // The second argument is NextFetchEvent in the real runtime and must be ignored.
  middleware(firstRequest, { waitUntil() {} });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'ct_attribution');
  assert.equal(writes[0][2].domain, '.recoupable.dev');
  assert.equal(writes[0][2].httpOnly, true);

  const firstCookieValue = writes[0][1];
  const laterRequest = {
    nextUrl: new URL('https://app.recoupable.dev/signup?utm_source=internal&utm_campaign=return'),
    consent: { advertising: true },
    cookies: { get: () => ({ value: firstCookieValue }) },
  };
  middleware(laterRequest, { waitUntil() {} });
  assert.equal(writes.length, 1, 'a later signup visit must not replace first touch');
});

test('attaches first touch to the server-owned account mutation', async () => {
  const value = JSON.stringify(captureFirstTouch('?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=click-123', {
    now: '2026-09-01T10:00:00.000Z',
  }));
  const result = await attachAttributionToAccount('account-42', {
    get: () => ({ value }),
  });
  assert.equal(result.accountId, 'account-42');
  assert.deepEqual(result.first_touch, {
    source: 'google',
    medium: 'cpc',
    campaign: 'spring',
    channel: 'Google Ads',
    landing_page: 'https://clicktrail.invalid/?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=click-123',
    touch_timestamp: '2026-09-01T10:00:00.000Z',
    gclid: 'click-123',
  });
});
