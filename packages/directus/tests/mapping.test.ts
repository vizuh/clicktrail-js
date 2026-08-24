import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLECTIONS,
  extractAttributionSignals,
  synthesizeLandingUrl,
  buildCanonicalPayload,
  hasAttributionSignal,
  eventForCollection,
} from '../src/lib/mapping.js';
import { emptyAttribution } from '../../clicktrail/src/core/merge.js';

describe('extractAttributionSignals', () => {
  it('finds flat ft_/lt_ keys verbatim', () => {
    const signals = extractAttributionSignals({
      ft_source: 'google',
      lt_campaign: 'spring',
      unrelated: 'keep-out',
    });
    expect(signals.flatKeys).toEqual(['ft_source', 'lt_campaign']);
    expect(signals.utmParams).toEqual({});
  });

  it('collects utm_* keys and click ids separately', () => {
    const signals = extractAttributionSignals({
      utm_source: 'newsletter',
      utm_campaign: 'may',
      gclid: 'G1',
      unknown_id: 'x',
    });
    expect(signals.utmParams).toEqual({ utm_campaign: 'may', utm_source: 'newsletter' });
    expect(signals.clickIds).toEqual({ gclid: 'G1' });
  });

  it('captures identity fields and raw URL pair', () => {
    const signals = extractAttributionSignals({
      visitor_id: 'v1',
      trail_id: 'trl_1',
      session_id: 's1',
      landing_url: 'https://site.test/?utm_source=x',
      referrer: 'https://google.com/',
    });
    expect(signals.identity).toEqual({ session_id: 's1', trail_id: 'trl_1', visitor_id: 'v1' });
    expect(signals.landingUrl).toContain('utm_source=x');
    expect(signals.referrer).toBe('https://google.com/');
  });

  it('ignores blank values deterministically (sorted keys)', () => {
    const signals = extractAttributionSignals({ utm_source: '', gclid: '', zzz: '1' });
    expect(signals.utmParams).toEqual({});
    expect(signals.clickIds).toEqual({});
  });
});

describe('synthesizeLandingUrl', () => {
  it('returns the real landing URL when present', () => {
    expect(synthesizeLandingUrl({}, {}, 'https://real.test/?a=1')).toBe('https://real.test/?a=1');
  });

  it('builds a deterministic query from utms + click ids', () => {
    const url = synthesizeLandingUrl(
      { utm_source: 'news letter', utm_campaign: 'b' },
      { fbclid: 'F1' },
      '',
    );
    expect(url).toBe('https://signal.invalid/?utm_campaign=b&utm_source=news%20letter&fbclid=F1');
  });

  it('returns null when there is nothing to parse', () => {
    expect(synthesizeLandingUrl({}, {}, '')).toBeNull();
  });
});

describe('buildCanonicalPayload', () => {
  it('merges a new utm touch as last touch over an existing stored payload', () => {
    const stored = emptyAttribution();
    stored['ft_source'] = 'bing';
    stored['lt_source'] = 'bing';
    const item = { ...stored, utm_source: 'newsletter' };
    const payload = buildCanonicalPayload(item);
    expect(payload['lt_source']).toBe('newsletter');
    expect(payload['ft_source']).toBe('bing'); // first touch is write-once
  });

  it('derives a paid touch from a bare click id', () => {
    const payload = buildCanonicalPayload({ ttclid: 'T1' });
    expect(payload['ttclid']).toBe('T1');
    expect(String(payload['lt_channel'] ?? '').length > 0 || String(payload['lt_medium'] ?? '').length > 0).toBe(true);
  });

  it('uses landing_url + external referrer pair directly', () => {
    const payload = buildCanonicalPayload({
      landing_url: 'https://site.test/landing',
      referrer: 'https://www.facebook.com/',
    });
    expect(payload['lt_landing_page']).toContain('/landing');
    expect(payload['lt_source']).toBe('facebook');
  });

  it('copies identity fields top-level', () => {
    const payload = buildCanonicalPayload({ visitor_id: 'v9', trail_id: 'trl_9', session_id: 's9' });
    expect(payload['visitor_id']).toBe('v9');
    expect(payload['trail_id']).toBe('trl_9');
    expect(payload['session_id']).toBe('s9');
  });

  it('returns just flat state when no new signals exist', () => {
    const payload = buildCanonicalPayload({ ft_medium: 'email', noise: true });
    expect(Object.keys(payload).sort()).toEqual(['ft_medium']);
  });
});

describe('collection mapping helpers', () => {
  it('maps configured collections to contract events', () => {
    expect(eventForCollection('leads')).toBe('lead');
    expect(eventForCollection('bookings')).toBe('booking');
    expect(eventForCollection('orders')).toBe('sale.recorded');
    expect(eventForCollection('articles')).toBeNull();
  });

  it('exposes the documented default collections', () => {
    expect([...DEFAULT_COLLECTIONS]).toEqual(['leads', 'bookings', 'orders']);
  });

  it('hasAttributionSignal detects signal variants', () => {
    expect(hasAttributionSignal({ gclid: 'g' })).toBe(true);
    expect(hasAttributionSignal({ utm_source: 's' })).toBe(true);
    expect(hasAttributionSignal({ landing_url: 'https://x.test/?utm_source=s' })).toBe(true);
    expect(hasAttributionSignal({ title: 'plain row' })).toBe(false);
    expect(hasAttributionSignal(null)).toBe(false);
    expect(hasAttributionSignal('nope')).toBe(false);
  });
});
