/**
 * createClickTrail x storage wiring: hydration on start(), persistence of
 * merges, real getSession values, consent-denied clears ALL attribution
 * storage, zero side effects before start().
 */
import { describe, expect, it } from 'vitest';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import {
  ATTRIBUTION_KEY,
  ATTRIBUTION_STORAGE_KEYS,
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '../src/browser/storage.js';
import type { StorageAdapter } from '../src/browser/storage.js';
import { emptyAttribution } from '../src/core/merge.js';

function fakeAdapter(): StorageAdapter & { map: Map<string, string>; writes: string[] } {
  const map = new Map<string, string>();
  const writes: string[] = [];
  const adapter = {
    map,
    writes,
    get: (k: string) => map.get(k) ?? null,
    set(k: string, v: string) { writes.push(`set:${k}`); map.set(k, v); },
    delete: (k: string) => { map.delete(k); },
  };
  return Object.assign(adapter, { map, writes });
}

const BYTES_VISITOR = new Uint8Array(16).fill(0x01);
const BYTES_SESSION = new Uint8Array(16).fill(0x02);

function uuid(bytes: Uint8Array): string {
  const b = bytes.slice();
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    '$1-$2-$3-$4-$5',
  );
}

describe('createClickTrail storage wiring', () => {
  it('zero side effects until start(): no adapter reads or writes happen', () => {
    const primary = fakeAdapter();
    const mirror = fakeAdapter();
    const ct = createClickTrail({
      destinations: [],
      storage: { primaryAdapter: primary, mirrorAdapter: mirror, randomBytes: () => BYTES_VISITOR },
    });
    ct.mergeParsedTouch({} as never); // even pre-start merges must not write
    expect(primary.writes).toHaveLength(0);
    expect(mirror.writes).toHaveLength(0);
  });

  it('start() hydrates the persisted payload and persists it back', () => {
    const primary = fakeAdapter();
    primary.set(
      ATTRIBUTION_KEY,
      JSON.stringify({ ft_source: 'google', gclid: 'abc', unknown_future_key: 'x' }),
    );
    const mirror = fakeAdapter();
    let nowMs = 1_000_000;
    const ct = createClickTrail({
      destinations: [],
      storage: {
        primaryAdapter: primary,
        mirrorAdapter: mirror,
        randomBytes: () => BYTES_VISITOR,
        nowMs: () => nowMs,
      },
    });
    ct.start();

    // Hydrated + normalized to canonical keys only.
    expect(ct.getField('ft_source')).toBe('google');
    expect(ct.getField('gclid')).toBe('abc');
    // Persisted back to BOTH surfaces.
    expect(primary.map.has(ATTRIBUTION_KEY)).toBe(true);
    expect(mirror.map.has(ATTRIBUTION_KEY)).toBe(true);
  });

  it('falls back to the mirror when the cookie surface is empty', () => {
    const primary = fakeAdapter();
    const mirror = fakeAdapter();
    mirror.set(ATTRIBUTION_KEY, JSON.stringify({ ft_medium: 'cpc' }));
    const ct = createClickTrail({
      destinations: [],
      storage: {
        primaryAdapter: primary,
        mirrorAdapter: mirror,
        randomBytes: () => BYTES_VISITOR,
        nowMs: () => 0,
      },
    });
    ct.start();
    expect(ct.getField('ft_medium')).toBe('cpc');
  });

  it('getSession() returns real browser-owned identity after start()', () => {
    let now = 5_000;
    const BYTES_SESSION_2 = new Uint8Array(16).fill(0x03);
    const chunks = [BYTES_VISITOR, BYTES_SESSION, BYTES_SESSION_2];
    let call = 0;
    const ct = createClickTrail({
      destinations: [],
      storage: {
        primaryAdapter: fakeAdapter(),
        mirrorAdapter: fakeAdapter(),
        randomBytes: () => chunks[Math.min(call++, 2)]!,
        nowMs: () => now,
      },
    });
    ct.start();
    const snap = ct.getSession();
    expect(snap.visitorId).toBe(uuid(BYTES_VISITOR));
    expect(snap.sessionId).toBe(uuid(BYTES_SESSION));
    expect(snap.sessionNumber).toBe('1');

    // Inactivity roll bumps the session number, keeps the visitor.
    now += 31 * 60 * 1000;
    const rolled = ct.getSession();
    expect(rolled.visitorId).toBe(snap.visitorId);
    expect(rolled.sessionNumber).toBe('2');
    expect(rolled.sessionId).toBe(uuid(BYTES_SESSION_2));
  });

  it('mergeParsedTouch after start() persists to both adapters', () => {
    const primary = fakeAdapter();
    const mirror = fakeAdapter();
    const ct = createClickTrail({
      destinations: [],
      storage: {
        primaryAdapter: primary,
        mirrorAdapter: mirror,
        randomBytes: () => BYTES_VISITOR,
        nowMs: () => 0,
      },
    });
    ct.start();
    ct.mergeParsedTouch({
      source: 'google', medium: 'cpc', campaign: '', term: '', content: '',
      utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
      referrer: '', landingPage: '/lp', touchTimestamp: '2026-08-23T10:00:00.000Z',
      channel: 'paid_search', channelLabel: 'Google Ads',
      clickIds: { gclid: 'xyz' },
    } as never);
    expect(ct.getField('gclid')).toBe('xyz');
    expect(mirror.map.has(ATTRIBUTION_KEY)).toBe(true);
    const mirrored = JSON.parse(mirror.map.get(ATTRIBUTION_KEY)!) as Record<string, unknown>;
    expect(mirrored['gclid']).toBe('xyz');
  });

  it('consent denial clears ALL attribution storage across both adapters', () => {
    const primary = fakeAdapter();
    const mirror = fakeAdapter();
    // Pre-seed every known key as if an earlier consented visit left them.
    for (const key of ATTRIBUTION_STORAGE_KEYS) {
      primary.set(key, 'old');
      mirror.set(key, 'old');
    }
    let consent = true;
    let call = 0;
    const ct = createClickTrail({
      destinations: [],
      consentGate: () => consent,
      storage: {
        primaryAdapter: primary,
        mirrorAdapter: mirror,
        randomBytes: () => (call++ === 0 ? BYTES_VISITOR : BYTES_SESSION),
        nowMs: () => 0,
      },
    });
    ct.start();
    expect(ct.getSession().sessionId).not.toBe('');

    consent = false;
    ct.track('page_view'); // capture attempt resolves consent -> denied

    expect(ct.getData()).toEqual(emptyAttribution());
    for (const key of [...ATTRIBUTION_STORAGE_KEYS]) {
      expect(primary.map.has(key)).toBe(false);
      expect(mirror.map.has(key)).toBe(false);
    }
    expect(ct.getSession()).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
  });

  it('without a storage config, behavior is unchanged (no identity generation)', () => {
    const ct = createClickTrail({ destinations: [] });
    ct.start();
    expect(ct.getSession()).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(() => ct.clearData()).not.toThrow();
  });
});
