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
    expect(dl.getArray()).toEqual([{ ...event, event: 'page_view' }]);
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
});
