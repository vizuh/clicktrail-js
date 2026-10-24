/**
 * createClickTrail lifecycle: zero side effects until start(); events flow
 * to all destinations only after start(). Consent gate + injected clock.
 */
import { describe, expect, it, vi } from 'vitest';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import { httpDestination, dataLayerDestination } from '../src/browser/transport.js';
import type { Destination } from '../src/browser/transport.js';

function recordingDestination(name = 'rec'): Destination & { events: Record<string, unknown>[]; started: boolean } {
  const dest = {
    name,
    started: false,
    events: [] as Record<string, unknown>[],
    start() { dest.started = true; },
    deliver(event: Record<string, unknown>) { dest.events.push(event); },
    clear() { dest.events.length = 0; },
  };
  return dest;
}

describe('createClickTrail', () => {
  it('does nothing until start(): no destination started, track is a no-op', () => {
    const dest = recordingDestination();
    const send = vi.fn();
    const http = httpDestination({ endpoint: 'https://t.example', batchSize: 1, send });
    const ct = createClickTrail({ destinations: [dest, http] });

    ct.track('page_view');
    expect(dest.events).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(dest.started).toBe(false);
    expect(ct.isStarted()).toBe(false);

    ct.start();
    expect(ct.isStarted()).toBe(true);
    expect(dest.started).toBe(true);
  });

  it('page_view flows to all destinations after start(), stamped and clocked', () => {
    const rec = recordingDestination();
    const dl = dataLayerDestination();
    const now = () => '2026-08-23T10:00:00Z';
    const ct = createClickTrail({ destinations: [rec, dl], now });
    ct.start();

    ct.track('page_view');

    expect(rec.events).toHaveLength(1);
    const event = rec.events[0]!;
    expect(event['event_name']).toBe('page_view');
    expect(event['event_time']).toBe('2026-08-23T10:00:00Z');
    expect(typeof event['schema_version']).toBe('string');
    expect(typeof event['classifier_version']).toBe('string');
    expect(String(event['event_id'])).toMatch(/^evt_/);
    expect((event['marketing_trail'] as Record<string, unknown>)['event_id']).toBe(event['event_id']);
    expect(dl.getArray()).toEqual([{ ...event, event: 'ct_page_view', datalayer_version: '2.0.0' }]);
  });

  it('consent gate returning false drops events and reports once at warn level', () => {
    const rec = recordingDestination();
    const reported: string[] = [];
    const ct = createClickTrail({
      destinations: [rec],
      consentGate: () => false,
      diagnosticsLevel: 'warn',
      diagnosticSink: { report: (d) => reported.push(d.code) },
    });
    ct.start();

    ct.track('page_view');
    ct.track('sale.completed');

    expect(rec.events).toHaveLength(0);
    expect(reported).toEqual(['consent_denied_capture_attempted']);
  });

  it('consent withdrawal clears buffered HTTP events before the next flush', () => {
    let consent = true;
    const send = vi.fn();
    const http = httpDestination({ endpoint: 'https://t.example', batchSize: 100, send });
    const ct = createClickTrail({ destinations: [http], consentGate: () => consent });
    ct.start();

    ct.track('page_view');
    consent = false;
    ct.stop();

    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when a destination cannot clear buffered events', () => {
    let consent = true;
    let retained = 0;
    let flushed = 0;
    const destination: Destination = {
      name: 'unclearable',
      deliver() { retained += 1; },
      clear() { throw new Error('clear failed'); },
      flush() { flushed += retained; },
    };
    const ct = createClickTrail({ destinations: [destination], consentGate: () => consent });
    ct.start();

    ct.track('page_view');
    consent = false;
    ct.track('page_view');
    consent = true;
    ct.stop();

    expect(retained).toBe(1);
    expect(flushed).toBe(0);
  });

  it('rechecks consent before delivering to each destination', () => {
    let consent = true;
    const delivered: string[] = [];
    const first: Destination = {
      name: 'first',
      deliver() {
        delivered.push('first');
        consent = false;
      },
      clear() {},
    };
    const second: Destination = {
      name: 'second',
      deliver() { delivered.push('second'); },
      clear() {},
    };
    const ct = createClickTrail({ destinations: [first, second], consentGate: () => consent });
    ct.start();

    ct.track('page_view');

    expect(delivered).toEqual(['first']);
  });

  it('rejects destinations that cannot clear queued events', () => {
    expect(() => createClickTrail({
      destinations: [{ name: 'unclearable', deliver: () => {} } as never],
    })).toThrow(/implement clear/);
  });

  it('rolls back started state when destination startup fails', () => {
    let fail = true;
    const dest: Destination = {
      name: 'retryable',
      start() {
        if (fail) {
          fail = false;
          throw new Error('startup failed');
        }
      },
      deliver() {},
      clear() {},
    };
    const ct = createClickTrail({ destinations: [dest] });

    expect(() => ct.start()).toThrow('startup failed');
    expect(ct.isStarted()).toBe(false);
    expect(() => ct.start()).not.toThrow();
    expect(ct.isStarted()).toBe(true);
  });

  it('rolls back every destination started before a later startup failure', () => {
    let fail = true;
    const stopped: string[] = [];
    const first: Destination = {
      name: 'first',
      start() {},
      stop() { stopped.push('first'); },
      deliver() {},
      clear() {},
    };
    const second: Destination = {
      name: 'second',
      start() {
        if (fail) {
          fail = false;
          throw new Error('later startup failed');
        }
      },
      stop() { stopped.push('second'); },
      deliver() {},
      clear() {},
    };
    const ct = createClickTrail({ destinations: [first, second] });

    expect(() => ct.start()).toThrow('later startup failed');
    expect(stopped).toEqual(['second', 'first']);
    expect(() => ct.start()).not.toThrow();
  });

  it('mergeParsedTouch feeds the payload that later events carry', () => {
    const rec = recordingDestination();
    const ct = createClickTrail({ destinations: [rec], now: () => '2026-08-23T10:00:00Z' });
    ct.start();

    ct.mergeParsedTouch({
      source: 'google',
      medium: 'cpc',
      campaign: 'botox-nyc',
      term: '',
      content: '',
      utmId: '',
      utmSourcePlatform: '',
      utmCreativeFormat: '',
      utmMarketingTactic: '',
      referrer: '',
      landingPage: 'https://example.com/pricing',
      touchTimestamp: '2026-08-23T10:00:00.000Z',
      channel: 'paid_search',
      channelLabel: 'Google Ads',
      clickIds: { gclid: 'GTEST' },
    });
    ct.track('page_view');

    const event = rec.events[0]!;
    expect(event['ft_source']).toBe('google');
    expect(event['gclid']).toBe('GTEST');
    expect(event['_channel']).toBeUndefined(); // channel is classification metadata, not a payload key
  });

  it('channelCodes: off by default, opt-in adds ft_/lt_channel_code to events and getData()', () => {
    const touch = {
      source: 'google', medium: 'cpc', campaign: '', term: '', content: '',
      utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
      referrer: '', landingPage: 'https://example.com/', touchTimestamp: '2026-08-23T10:00:00.000Z',
      channel: 'paid_search' as const, channelLabel: 'Google Ads', clickIds: { gclid: 'GTEST' },
    };

    const plain = recordingDestination();
    const ctPlain = createClickTrail({ destinations: [plain] });
    ctPlain.start();
    ctPlain.mergeParsedTouch(touch);
    ctPlain.track('page_view');
    expect(plain.events[0]).not.toHaveProperty('ft_channel_code');
    expect(plain.events[0]).not.toHaveProperty('lt_channel_code');
    expect(plain.events[0]!['ft_channel']).toBe('Google Ads');

    const coded = recordingDestination();
    const ctCoded = createClickTrail({ destinations: [coded], channelCodes: true });
    ctCoded.start();
    ctCoded.mergeParsedTouch(touch);
    ctCoded.track('page_view');
    const event = coded.events[0]!;
    expect(event['ft_channel']).toBe('Google Ads');
    expect(event['ft_channel_code']).toBe('paid_search');
    expect(event['lt_channel_code']).toBe('paid_search');
    expect(ctCoded.getField('lt_channel_code')).toBe('paid_search');
    // The marketing_trail envelope has no channel slot (plugin parity).
    expect(event['marketing_trail']).not.toHaveProperty('channel');
    expect(event['marketing_trail']).not.toHaveProperty('channel_code');
  });

  it('mergeOptions apply to every mergeParsedTouch', () => {
    const touch = {
      source: 'google', medium: 'cpc', campaign: '', term: '', content: '',
      utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
      referrer: '', landingPage: '/', touchTimestamp: '2026-10-23T10:00:00.000Z',
      channel: 'paid_search', channelLabel: 'Google Ads', clickIds: { gclid: 'A1' },
    } as const;
    const organic = { ...touch, medium: 'organic', referrer: 'www.google.com', channel: 'organic_search', channelLabel: 'Google Organic', clickIds: {} } as const;
    const ct = createClickTrail({ destinations: [], mergeOptions: { clearLastTouchClickIds: true } });
    ct.mergeParsedTouch({ ...touch, clickIds: { ...touch.clickIds } });
    ct.mergeParsedTouch({ ...organic, clickIds: {} });
    expect(ct.getField('lt_gclid')).toBe('');
    expect(ct.getField('ft_gclid')).toBe('A1');
    expect(ct.getField('gclid')).toBe('A1');
  });

  it('stop() flushes buffered http events and halts delivery', () => {
    const calls: string[] = [];
    const http = httpDestination({
      endpoint: 'https://t.example',
      batchSize: 100,
      send: (_endpoint, body) => { calls.push(body); },
    });
    const ct = createClickTrail({ destinations: [http] });
    ct.start();
    ct.track('page_view');
    expect(calls).toHaveLength(0);

    ct.stop();
    expect(calls).toHaveLength(1);

    ct.track('lead.submitted'); // stopped: no-op
    expect(calls).toHaveLength(1);
  });

  it('stop() completes cleanup when a destination flush throws', () => {
    const ct = createClickTrail({
      destinations: [{ name: 'broken', deliver: () => {}, clear: () => {}, flush: () => { throw new Error('boom'); } }],
    });
    ct.start();

    expect(() => ct.stop()).not.toThrow();
    expect(ct.isStarted()).toBe(false);
  });

  it('handles an asynchronous destination flush rejection', async () => {
    const reported: string[] = [];
    const ct = createClickTrail({
      destinations: [{ name: 'broken', deliver: () => {}, clear: () => {}, flush: async () => { throw new Error('boom'); } }],
      diagnosticsLevel: 'warn',
      diagnosticSink: { report: (d) => reported.push(d.code) },
    });
    ct.start();
    ct.stop();
    await Promise.resolve();

    expect(ct.isStarted()).toBe(false);
    expect(reported).toEqual(['destination_flush_failed']);
  });

  it('silent diagnostics (default) report nothing on pre-start track', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ct = createClickTrail({ destinations: [] });
      ct.track('page_view');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe('captureLanding with ignoredReferrerHosts', () => {
    const landing = (referrer: string, query = '') => ({
      url: `https://shop.example.com/checkout/order-received/${query}`,
      referrer,
      currentHost: 'shop.example.com',
      now: '2026-10-23T10:05:00.000Z',
    });
    const paidTouch = {
      url: 'https://shop.example.com/?utm_source=google&utm_medium=cpc&utm_campaign=brand&gclid=GSYNTH',
      referrer: '',
      currentHost: 'shop.example.com',
      now: '2026-10-23T10:00:00.000Z',
    };

    it('keeps the stored last touch on a payment return and reports the diagnostic', () => {
      const reported: unknown[] = [];
      const ct = createClickTrail({
        destinations: [],
        ignoredReferrerHosts: ['paypal.com', 'stripe.com'],
        diagnosticSink: { report: (d) => reported.push(d) },
      });
      expect(ct.captureLanding(paidTouch).kind).toBe('touch');
      const before = ct.getData();

      const result = ct.captureLanding(landing('https://www.paypal.com/checkoutnow?token=SYNTHETIC'));

      expect(result).toEqual({ kind: 'none', reason: 'ignored_referrer' });
      expect(ct.getData()).toEqual(before);
      expect(ct.getField('lt_source')).toBe('google');
      expect(reported).toEqual([{
        code: 'ignored_referrer_host',
        level: 'info',
        message: 'Ignored referrer created no touch; stored attribution kept.',
        context: { referrer_host: 'paypal.com', touch: false },
      }]);
    });

    it('merges URL-parameter touches with the referrer blanked', () => {
      const reported: string[] = [];
      const ct = createClickTrail({
        destinations: [],
        ignoredReferrerHosts: ['stripe.com'],
        diagnosticSink: { report: (d) => reported.push(d.code) },
      });
      const result = ct.captureLanding(
        landing('https://checkout.stripe.com/c/pay/cs_test_synthetic', '?utm_source=newsletter&utm_medium=email'),
      );
      expect(result.kind).toBe('touch');
      expect(ct.getField('lt_source')).toBe('newsletter');
      expect(ct.getField('lt_referrer')).toBe('');
      expect(reported).toEqual(['ignored_referrer_host']);
    });

    it('classifies payment hosts as referral when no list is configured', () => {
      const reported: string[] = [];
      const ct = createClickTrail({
        destinations: [],
        diagnosticSink: { report: (d) => reported.push(d.code) },
      });
      ct.captureLanding(landing('https://www.paypal.com/checkoutnow'));
      expect(ct.getField('lt_source')).toBe('paypal.com');
      expect(ct.getField('lt_medium')).toBe('referral');
      expect(reported).toEqual([]);
    });
  });
});
