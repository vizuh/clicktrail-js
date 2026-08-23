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
    // Same stamped object reached the dataLayer destination.
    expect(dl.getArray()).toEqual([event]);
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
      touchTimestamp: '2026-08-23T10:00:00Z',
      channel: 'paid_search',
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
