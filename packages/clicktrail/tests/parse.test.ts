import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';

describe('parseAttributionUrl', () => {
  it('parses Google Ads UTMs + gclid into a paid_search touch', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=botox-nyc&gclid=XYZ',
      now: '2026-08-23T10:00:00Z',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google');
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.campaign).toBe('botox-nyc');
    expect(r.touch.channel).toBe('paid_search');
    expect(r.touch.landingPage).toBe('https://example.com/pricing');
    expect(r.touch.touchTimestamp).toBe('2026-08-23T10:00:00Z');
  });

  it('infers a paid touch from fbclid alone', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?fbclid=Abc' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('facebook');
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.channel).toBe('paid_social');
  });

  it('classifies a google referrer as organic search', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://www.google.com/search?q=test',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.medium).toBe('organic');
    expect(r.touch.channel).toBe('organic_search');
  });

  it('classifies social referrers as organic social', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://l.instagram.com/?u=x',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
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
});
