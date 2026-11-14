import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { SENSITIVE_QUERY_KEYS } from '../src/core/knowledge.js';
import type { ParseAttributionInput } from '../src/core/types.js';

const NOW = '2026-11-14T10:00:00.000Z';
// Issue #83 scenario: email, token and phone next to UTMs and a click ID.
const URL_WITH_PII =
  'https://example.com/lp?email=a%40b.com&utm_source=google&utm_medium=cpc&token=abc123&gclid=G1&phone=%2B5511999999999&utm_term=best+clinic#plans';

function landing(input: Partial<ParseAttributionInput>): string {
  const r = parseAttributionUrl({ url: URL_WITH_PII, now: NOW, ...input });
  if (r.kind !== 'touch') throw new Error('expected a touch');
  return r.touch.landingPage;
}

function referrer(input: Partial<ParseAttributionInput>): string {
  const r = parseAttributionUrl({ url: 'https://example.com/', currentHost: 'example.com', now: NOW, ...input });
  if (r.kind !== 'touch') throw new Error('expected a touch');
  return r.touch.referrer;
}

describe('sensitive query redaction (#83)', () => {
  it("default 'url' landing drops email/token/phone and keeps UTMs, click IDs, order, encoding and fragment", () => {
    expect(landing({})).toBe('https://example.com/lp?utm_source=google&utm_medium=cpc&gclid=G1&utm_term=best+clinic#plans');
  });

  it("'path+allowlisted-query' redacts a sensitive key even when the caller allowlists it", () => {
    expect(landing({ landingPageFormat: 'path+allowlisted-query', landingPageQueryAllowlist: ['email', 'token', 'gclid'] }))
      .toBe('/lp?gclid=G1');
  });

  it("'path' stores no query, so nothing to redact", () => {
    expect(landing({ landingPageFormat: 'path' })).toBe('/lp');
  });

  it("default 'url' referrer drops sensitive keys and keeps the rest verbatim", () => {
    expect(referrer({ referrer: 'https://news.example.org/a?q=1&access_token=zzz&user_email=a%40b.com&ref=home#x' }))
      .toBe('https://news.example.org/a?q=1&ref=home#x');
  });

  it('drops the "?" when every referrer key is sensitive and leaves a clean referrer untouched', () => {
    expect(referrer({ referrer: 'https://news.example.org/a?token=1&password=2' })).toBe('https://news.example.org/a');
    expect(referrer({ referrer: 'https://www.google.com' })).toBe('https://www.google.com');
  });

  it("referrer 'host' is unchanged", () => {
    expect(referrer({ referrer: 'https://news.example.org/a?token=1', referrerFormat: 'host' })).toBe('news.example.org');
  });

  it('redacts on the referrer-inference path too', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/?email=a%40b.com',
      referrer: 'https://www.google.com/search?q=x&sid=S1',
      currentHost: 'example.com',
      now: NOW,
    });
    if (r.kind !== 'touch') throw new Error('expected a touch');
    expect(r.touch.landingPage).toBe('https://example.com/');
    expect(r.touch.referrer).toBe('https://www.google.com/search?q=x');
    expect(r.touch.channelLabel).toBe('Google Organic');
  });

  it('redacts the unmeasured placeholder landing page', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/a?email=a%40b.com&x=1', currentHost: 'example.com', now: NOW, recordDirectTouch: true });
    if (r.kind !== 'touch') throw new Error('expected a touch');
    expect(r.touch.landingPage).toBe('https://example.com/a?x=1');
  });

  it('matches exact keys and _<word> suffixes, case-insensitively, but not look-alikes', () => {
    const url = 'https://example.com/?E-Mail=1&user_email=2&MY_TOKEN=3&monkey=4&keyboard=5&emailer=6&api-key=7&utm_campaign=ok';
    expect(landing({ url })).toBe('https://example.com/?monkey=4&keyboard=5&emailer=6&api-key=7&utm_campaign=ok');
  });

  it('matches percent-encoded keys', () => {
    expect(landing({ url: 'https://example.com/?%65mail=1&user%5Femail=2&keep=3&utm_source=x' }))
      .toBe('https://example.com/?keep=3&utm_source=x');
    // A malformed escape cannot be decoded, so it is matched raw and kept.
    expect(landing({ url: 'https://example.com/?e%mail=1&utm_source=x' })).toBe('https://example.com/?e%mail=1&utm_source=x');
  });

  it('never removes utm_* keys, click IDs, aliases or browser IDs, even when they match the suffix rule', () => {
    const url = 'https://example.com/?utm_code=1&utm_id=2&li_fat_id=3&sc_click_id=4&fbp=5&_fbc=6&ga_session_id=7&epik=8';
    expect(landing({ url })).toBe(url);
  });

  it('keeps attribution keys even when the caller adds them to the sensitive list', () => {
    const url = 'https://example.com/?gclid=G1&utm_source=google&email=1';
    expect(landing({ url, additionalSensitiveQueryKeys: ['gclid', 'UTM_Source', 'email'] }))
      .toBe('https://example.com/?gclid=G1&utm_source=google');
  });

  it('additionalSensitiveQueryKeys extends the list: exact key and _<word> suffix, case-insensitive', () => {
    const url = 'https://example.com/?member=1&club_member=2&Member=3&other=4&utm_source=x';
    expect(landing({ url, additionalSensitiveQueryKeys: ['MEMBER'] })).toBe('https://example.com/?other=4&utm_source=x');
    expect(referrer({ referrer: 'https://x.example.org/?member=1&k=2', additionalSensitiveQueryKeys: ['member'] }))
      .toBe('https://x.example.org/?k=2');
  });

  it('exports the shared list and leaves the signal untouched', () => {
    expect(SENSITIVE_QUERY_KEYS).toEqual([
      'email', 'e-mail', 'mail', 'phone', 'tel', 'mobile', 'token', 'access_token', 'id_token', 'auth',
      'password', 'pass', 'pwd', 'secret', 'key', 'api_key', 'apikey', 'code', 'otp', 'session', 'sessionid',
      'sid', 'signature', 'sig', 'nonce', 'ssn', 'card', 'iban',
    ]);
    const r = parseAttributionUrl({ url: URL_WITH_PII, now: NOW });
    if (r.kind !== 'touch') throw new Error('expected a touch');
    expect(r.touch.source).toBe('google');
    expect(r.touch.clickIds).toEqual({ gclid: 'G1' });
  });
});
