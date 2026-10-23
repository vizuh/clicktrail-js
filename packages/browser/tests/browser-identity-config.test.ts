/**
 * createClickTrail x config.identity: host seed adoption (once, consent-gated,
 * never over an existing identity), seed diagnostics, configurable session
 * idle/max timing, and construction-time validation.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@vizuh/clicktrail-core';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import type { ClickTrailConfig } from '../src/browser/create-clicktrail.js';
import {
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '../src/browser/storage.js';
import type { StorageAdapter } from '../src/browser/storage.js';

function fakeAdapter(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v); },
    delete: (k: string) => { map.delete(k); },
  };
}

const VISITOR = '3f0b2c9e-6a1d-4b7e-9c2a-8d5e4f1a2b3c';
const SESSION = '7c1d4e2f-0a9b-4c8d-8e7f-6a5b4c3d2e1f';
const MIN = 60 * 1000;

function setup(overrides: Partial<ClickTrailConfig> = {}, mirror = fakeAdapter()) {
  let now = 1_000_000;
  let n = 0;
  let seedCalls = 0;
  const diagnostics: Diagnostic[] = [];
  const ct = createClickTrail({
    destinations: [],
    diagnosticSink: { report: (d) => diagnostics.push(d) },
    storage: {
      primaryAdapter: fakeAdapter(),
      mirrorAdapter: mirror,
      randomBytes: () => new Uint8Array(16).fill(++n),
      nowMs: () => now,
    },
    identity: {
      seed: () => {
        seedCalls++;
        return { visitorId: VISITOR, sessionId: SESSION, sessionStartedAt: now - 5 * MIN };
      },
    },
    ...overrides,
  });
  return {
    ct,
    mirror,
    diagnostics,
    seedCalls: () => seedCalls,
    advance: (ms: number) => { now += ms; },
  };
}

describe('config.identity.seed', () => {
  it('adopts the host IDs once and the next instance keeps them from storage', () => {
    const first = setup();
    first.ct.start();
    expect(first.ct.getSession()).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: '1' });
    first.ct.track('page_view');
    expect(first.ct.getSession().sessionId).toBe(SESSION);
    expect(first.seedCalls()).toBe(1);
    expect(first.mirror.map.get(VISITOR_ID_FALLBACK_KEY)).toBe(VISITOR);
    expect(first.mirror.map.get(SESSION_ID_FALLBACK_KEY)).toBe(SESSION);

    // Page reload: same storage, host seed would now return different IDs.
    const second = setup(
      { identity: { seed: () => ({ visitorId: 'other-visitor-id', sessionId: 'other-session-id' }) } },
      first.mirror,
    );
    second.ct.start();
    expect(second.ct.getSession()).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: '1' });
  });

  it('is never called when a ClickTrail identity already exists', () => {
    const mirror = fakeAdapter();
    mirror.set(SESSION_STATE_KEY, JSON.stringify({ session_id: 'ct-session-0001', session_number: 4, last_event_ts: 1_000_000 }));
    mirror.set(VISITOR_ID_FALLBACK_KEY, 'ct-visitor-0001');
    const { ct, seedCalls } = setup({}, mirror);
    ct.start();
    expect(ct.getSession()).toEqual({ visitorId: 'ct-visitor-0001', sessionId: 'ct-session-0001', sessionNumber: '4' });
    expect(seedCalls()).toBe(0);
  });

  it('is not called after clearData() wipes an identity that predates the instance', () => {
    const mirror = fakeAdapter();
    mirror.set(SESSION_STATE_KEY, JSON.stringify({ session_id: 'ct-session-0001', session_number: 1, last_event_ts: 1_000_000 }));
    mirror.set(VISITOR_ID_FALLBACK_KEY, 'ct-visitor-0001');
    const { ct, seedCalls } = setup({}, mirror);
    ct.start();
    expect(ct.getSession().visitorId).toBe('ct-visitor-0001');
    ct.clearData();
    const fresh = ct.getSession().visitorId;
    expect(fresh).not.toBe(VISITOR);
    expect(fresh).not.toBe('ct-visitor-0001');
    expect(seedCalls()).toBe(0);
  });

  it('is never called while consent is denied, and nothing is stored', () => {
    let consent = false;
    const { ct, mirror, seedCalls } = setup({ consentGate: () => consent });
    ct.start();
    ct.track('page_view');
    expect(ct.getSession()).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(seedCalls()).toBe(0);
    expect(mirror.map.has(SESSION_STATE_KEY)).toBe(false);
    expect(mirror.map.has(VISITOR_ID_FALLBACK_KEY)).toBe(false);

    // Consent granted later on the same page: the seed is adopted then.
    consent = true;
    expect(ct.getSession().visitorId).toBe(VISITOR);
    expect(seedCalls()).toBe(1);
  });

  it('is not re-adopted after consent withdrawal clears identity', () => {
    let consent = true;
    const { ct, seedCalls } = setup({ consentGate: () => consent });
    ct.start();
    expect(ct.getSession().visitorId).toBe(VISITOR);
    consent = false;
    expect(ct.getSession().visitorId).toBe('');
    consent = true;
    const fresh = ct.getSession();
    expect(fresh.visitorId).not.toBe(VISITOR);
    expect(fresh.visitorId).not.toBe('');
    expect(seedCalls()).toBe(1);
  });

  it('reports identity_seed_rejected and mints fresh IDs for an invalid seed', () => {
    const { ct, diagnostics } = setup({ identity: { seed: () => ({ visitorId: 'bad id' }) } });
    ct.start();
    expect(ct.getSession().visitorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    expect(diagnostics.map((d) => d.code)).toContain('identity_seed_rejected');
  });

  it('no seed keeps the default behaviour (fresh UUIDs)', () => {
    const { ct } = setup({ identity: {} });
    ct.start();
    expect(ct.getSession().visitorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });
});

describe('config.identity session timing', () => {
  it('sessionIdleMs replaces the 30-minute default', () => {
    const { ct, advance } = setup({ identity: { sessionIdleMs: 120 * MIN } });
    ct.start();
    const first = ct.getSession();
    advance(45 * MIN);
    expect(ct.getSession().sessionId).toBe(first.sessionId);
    advance(80 * MIN);
    expect(ct.getSession().sessionNumber).toBe('2');
  });

  it('defaults stay at a 30-minute idle timeout', () => {
    const { ct, advance } = setup({ identity: {} });
    ct.start();
    expect(ct.getSession().sessionNumber).toBe('1');
    advance(30 * MIN);
    expect(ct.getSession().sessionNumber).toBe('2');
  });

  it('sessionMaxMs ends a seeded session at its host start time + max', () => {
    // Seeded session started 5 min before start(); max 10 min.
    const { ct, advance } = setup({
      identity: {
        seed: () => ({ visitorId: VISITOR, sessionId: SESSION, sessionStartedAt: 1_000_000 - 5 * MIN }),
        sessionIdleMs: 120 * MIN,
        sessionMaxMs: 10 * MIN,
      },
    });
    ct.start();
    expect(ct.getSession().sessionId).toBe(SESSION);
    advance(4 * MIN);
    expect(ct.getSession().sessionId).toBe(SESSION);
    advance(MIN);
    const rolled = ct.getSession();
    expect(rolled.sessionId).not.toBe(SESSION);
    expect(rolled.sessionNumber).toBe('2');
    expect(rolled.visitorId).toBe(VISITOR);
  });
});

describe('config.identity validation', () => {
  const base = { destinations: [], storage: { primaryAdapter: fakeAdapter(), mirrorAdapter: fakeAdapter() } };

  it('requires storage', () => {
    expect(() => createClickTrail({ destinations: [], identity: {} })).toThrow(TypeError);
  });

  it('rejects a non-function seed', () => {
    expect(() => createClickTrail({ ...base, identity: { seed: 'visitor' as never } })).toThrow(TypeError);
  });

  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects sessionIdleMs/sessionMaxMs/visitorMaxAgeMs = ${bad}`, () => {
      expect(() => createClickTrail({ ...base, identity: { sessionIdleMs: bad } })).toThrow(RangeError);
      expect(() => createClickTrail({ ...base, identity: { sessionMaxMs: bad } })).toThrow(RangeError);
      expect(() => createClickTrail({ ...base, identity: { visitorMaxAgeMs: bad } })).toThrow(RangeError);
    });
  }
});
