import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { areRelatedHosts } from '../src/core/sanitize.js';
import { resolveChannelLabel } from '../src/core/knowledge.js';

describe('parseAttributionUrl', () => {
  it('parses Google Ads UTMs + gclid into a paid_search touch', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=botox-nyc&gclid=XYZ',
      now: '2026-08-23T10:00:00.000Z',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google');
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.campaign).toBe('botox-nyc');
    expect(r.touch.channel).toBe('paid_search');
    // Ruling #12: landing page stores the FULL href including query string.
    expect(r.touch.landingPage).toBe(
      'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=botox-nyc&gclid=XYZ',
    );
    // Ruling #13: millisecond ISO is the frozen timestamp format.
    expect(r.touch.touchTimestamp).toBe('2026-08-23T10:00:00.000Z');
  });

  it('infers a paid touch from fbclid alone', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?fbclid=Abc' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('facebook');
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.channel).toBe('paid_social');
    expect(r.touch.channelLabel).toBe('Facebook Ads');
  });

  it('classifies a google referrer as organic search with canonical source name', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://www.google.com/search?q=test',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google'); // ruling #4: canonical name, not host
    expect(r.touch.medium).toBe('organic');
    expect(r.touch.channel).toBe('organic_search');
    expect(r.touch.channelLabel).toBe('Google Organic');
  });

  it('classifies social referrers as organic social', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://l.instagram.com/?u=x',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('instagram');
    expect(r.touch.medium).toBe('social');
    expect(r.touch.channel).toBe('organic_social');
  });

  it('ignores internal referrers', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/contact',
      referrer: 'https://www.example.com/pricing',
      currentHost: 'example.com',
    });
    expect(r).toEqual({ kind: 'none', reason: 'internal_referrer' });
  });

  it('returns no_signal for a bare landing without params or referrer', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/' });
    expect(r.kind).toBe('none');
  });

  it('folds sc_click_id into sccid and classifies paid_social', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?sc_click_id=S1' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.channel).toBe('paid_social');
  });

  // --- WP-parity rulings ---

  it('#9: lowercases mixed-case UTM keys before lookup', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?Utm_Source=google&UTM_CAMPAIGN=spring' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google');
    expect(r.touch.campaign).toBe('spring');
  });

  it('#11: last duplicate parameter occurrence wins', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?utm_campaign=a&utm_campaign=b' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.campaign).toBe('b');
  });

  it('#15: rejects whole values matching the {{...}} macro pattern', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?utm_source=x&utm_campaign=%7B%7Bc.name%7D%7D' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.campaign).toBe('');
  });

  it('#8: treats non-http(s) referrer protocols as no external referrer', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'android-app://com.some.app/page',
      currentHost: 'example.com',
    });
    expect(r).toEqual({ kind: 'none', reason: 'no_signal' });
  });
});

describe('areRelatedHosts (ruling #8)', () => {
  it('is symmetric for sibling subdomains', () => {
    expect(areRelatedHosts('shop.example.com', 'example.com')).toBe(true);
    expect(areRelatedHosts('example.com', 'shop.example.com')).toBe(true);
    expect(areRelatedHosts('app.example.com', 'shop.example.com')).toBe(false); // siblings, no containment
  });
  it('rejects unrelated hosts and empty input', () => {
    expect(areRelatedHosts('example.com', 'notexample.com')).toBe(false);
    expect(areRelatedHosts('example.com', '')).toBe(false);
  });
});

describe('resolveChannelLabel (ruling #3)', () => {
  it('labels AI-assistant referrers before search-engine rules', () => {
    expect(resolveChannelLabel({
      source: 'gemini.google.com', medium: 'referral', clickIds: {},
      referrer: 'https://gemini.google.com/app/xyz',
    })).toBe('Gemini');
    expect(resolveChannelLabel({
      source: 'chatgpt.com', medium: 'referral', clickIds: {},
      referrer: 'https://chatgpt.com/c/abc',
    })).toBe('ChatGPT');
  });

  it('labels paid mediums by source before the referrer block', () => {
    expect(resolveChannelLabel({
      source: 'meta', medium: 'paid_social', clickIds: {},
      referrer: 'https://www.google.com/search?q=x',
    })).toBe('Facebook Ads');
  });

  it('falls back to Unknown without signals', () => {
    expect(resolveChannelLabel({ source: '', medium: '', clickIds: {} })).toBe('Unknown');
  });
});
