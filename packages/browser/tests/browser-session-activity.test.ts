/**
 * createClickTrail session activity (#63): touchSession(), identity.activityOnTrack,
 * getSession({ passive: true }) and IdentitySeed.lastActivityAt, replayed on
 * a fake clock. Passive seed adoption and identity.visitorMaxAgeMs (#72).
 */
import { describe, expect, it } from 'vitest';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import type { ClickTrailIdentityConfig } from '../src/browser/create-clicktrail.js';
import { SESSION_ID_FALLBACK_KEY, SESSION_STATE_KEY, VISITOR_ID_FALLBACK_KEY } from '../src/browser/storage.js';
import type { StorageAdapter } from '../src/browser/storage.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SESSION = '7c1d4e2f-0a9b-4c8d-8e7f-6a5b4c3d2e1f';
const VISITOR = '3f0b2c9e-6a1d-4b7e-9c2a-8d5e4f1a2b3c';

function recordingAdapter(): StorageAdapter & { map: Map<string, string>; writes: number } {
  const map = new Map<string, string>();
  const adapter = {
    map,
    writes: 0,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { adapter.writes++; map.set(k, v); },
    delete: (k: string) => { adapter.writes++; map.delete(k); },
  };
  return adapter;
}

function setup(identity: ClickTrailIdentityConfig, opts: { consent?: () => boolean } = {}) {
  let now = 1_700_000_000_000;
  let n = 0;
  const mirror = recordingAdapter();
  const ct = createClickTrail({
    destinations: [],
    ...(opts.consent ? { consentGate: opts.consent } : {}),
    storage: {
      primaryAdapter: recordingAdapter(),
      mirrorAdapter: mirror,
      randomBytes: () => new Uint8Array(16).fill(++n),
      nowMs: () => now,
    },
    identity,
  });
  return {
    ct,
    mirror,
    now: () => now,
    advance: (ms: number) => { now += ms; },
    randomCalls: () => n,
  };
}

const TIMING = { sessionIdleMs: 2 * HOUR, sessionMaxMs: 24 * HOUR };

describe('touchSession(): idle window counts from the last activity', () => {
  it('a touch every 30 min keeps one session_id for 24 h and rolls at 24 h', () => {
    const { ct, advance } = setup(TIMING);
    ct.start();
    const first = ct.touchSession();
    expect(first.sessionNumber).toBe('1');
    for (let elapsed = 30 * MIN; elapsed < 24 * HOUR; elapsed += 30 * MIN) {
      advance(30 * MIN);
      expect(ct.touchSession().sessionId).toBe(first.sessionId);
    }
    advance(30 * MIN); // exactly 24 h after the session started
    const rolled = ct.touchSession();
    expect(rolled.sessionId).not.toBe(first.sessionId);
    expect(rolled.sessionNumber).toBe('2');
    expect(rolled.visitorId).toBe(first.visitorId);
  });

  it('without touches the session rolls 2 h after the last touch, not after the start', () => {
    const { ct, advance } = setup(TIMING);
    ct.start();
    const first = ct.touchSession();
    advance(90 * MIN);
    ct.touchSession(); // last activity: start + 90 min
    advance(2 * HOUR - 1); // start + 3 h 30 min - 1 ms: past start + 2 h
    expect(ct.getSession().sessionId).toBe(first.sessionId);
    advance(1); // exactly 2 h after the last touch
    const rolled = ct.getSession();
    expect(rolled.sessionId).not.toBe(first.sessionId);
    expect(rolled.sessionNumber).toBe('2');
  });

  it('is consent-gated: denied returns an empty snapshot and stores no identity', () => {
    let granted = false;
    const { ct, mirror } = setup(TIMING, { consent: () => granted });
    ct.start();
    expect(ct.touchSession()).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(mirror.map.size).toBe(0);
    granted = true;
    expect(ct.touchSession().sessionNumber).toBe('1');
  });

  it('is a no-op before start()', () => {
    const { ct, mirror } = setup(TIMING);
    expect(ct.touchSession()).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(mirror.writes).toBe(0);
  });
});

describe('identity.activityOnTrack', () => {
  it('defaults to true: track() every 30 min keeps the session alive past the idle timeout', () => {
    const { ct, advance } = setup(TIMING);
    ct.start();
    const first = ct.getSession();
    for (let i = 0; i < 10; i++) {
      advance(30 * MIN);
      ct.track('page_view');
    }
    advance(2 * HOUR - 1);
    expect(ct.getSession().sessionId).toBe(first.sessionId);
  });

  it('false: track() does not count as activity', () => {
    const { ct, advance } = setup({ ...TIMING, activityOnTrack: false });
    ct.start();
    const first = ct.getSession();
    for (let i = 0; i < 3; i++) {
      advance(30 * MIN);
      ct.track('page_view');
    }
    advance(30 * MIN); // 2 h after the session started; no recorded activity since
    expect(ct.getSession().sessionNumber).toBe('2');
    expect(ct.getSession().sessionId).not.toBe(first.sessionId);
  });

  it('track() after expiry starts a new session (never revives the old one)', () => {
    const { ct, advance } = setup(TIMING);
    ct.start();
    const first = ct.getSession();
    advance(2 * HOUR);
    ct.track('page_view');
    expect(ct.getSession({ passive: true }).sessionNumber).toBe('2');
    expect(ct.getSession().sessionId).not.toBe(first.sessionId);
  });

  it('rejects a non-boolean value at construction', () => {
    expect(() =>
      createClickTrail({
        destinations: [],
        storage: { primaryAdapter: recordingAdapter(), mirrorAdapter: recordingAdapter() },
        identity: { activityOnTrack: 'yes' as never },
      }),
    ).toThrow(TypeError);
  });
});

describe('getSession({ passive: true })', () => {
  it('never writes storage and returns no session after expiry', () => {
    const { ct, mirror, advance } = setup(TIMING);
    ct.start();
    const startWrites = mirror.writes;
    expect(ct.getSession({ passive: true })).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(mirror.writes).toBe(startWrites);

    const live = ct.touchSession();
    const writes = mirror.writes;
    advance(2 * HOUR - 1);
    expect(ct.getSession({ passive: true })).toEqual(live);
    advance(1);
    expect(ct.getSession({ passive: true })).toEqual({ visitorId: live.visitorId, sessionId: '', sessionNumber: '' });
    expect(mirror.writes).toBe(writes);
  });

  it('is empty while consent is denied', () => {
    let granted = true;
    const { ct } = setup(TIMING, { consent: () => granted });
    ct.start();
    ct.touchSession();
    granted = false;
    expect(ct.getSession({ passive: true })).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
  });

  it('adopts a seed whose session is still valid on the first (passive) read', () => {
    let calls = 0;
    let seedNow = 0;
    const ctx = setup({
      ...TIMING,
      seed: () => {
        calls++;
        return { visitorId: VISITOR, sessionId: SESSION, sessionStartedAt: seedNow - HOUR, lastActivityAt: seedNow - 10 * MIN };
      },
    });
    seedNow = ctx.now();
    ctx.ct.start();
    expect(ctx.ct.getSession({ passive: true })).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: '1' });
    expect(ctx.mirror.map.get(VISITOR_ID_FALLBACK_KEY)).toBe(VISITOR);
    expect(ctx.mirror.map.get(SESSION_ID_FALLBACK_KEY)).toBe(SESSION);
    expect(JSON.parse(ctx.mirror.map.get(SESSION_STATE_KEY)!)).toEqual({
      session_id: SESSION,
      session_number: 1,
      session_started_at: seedNow - HOUR,
      last_event_ts: seedNow - 10 * MIN,
    });
    expect(ctx.randomCalls()).toBe(0);
    expect(ctx.ct.touchSession()).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: '1' });
    expect(calls).toBe(1);
  });

  it('with an expired seeded session returns the seeded visitor, no session, and writes none', () => {
    let seedNow = 0;
    const ctx = setup({
      ...TIMING,
      seed: () => ({ visitorId: VISITOR, sessionId: SESSION, lastActivityAt: seedNow - 3 * HOUR }),
    });
    seedNow = ctx.now();
    ctx.ct.start();
    const writes = ctx.mirror.writes;
    expect(ctx.ct.getSession({ passive: true })).toEqual({ visitorId: VISITOR, sessionId: '', sessionNumber: '' });
    expect(ctx.mirror.map.has(SESSION_STATE_KEY)).toBe(false);
    expect(ctx.mirror.writes).toBe(writes);
    expect(ctx.randomCalls()).toBe(0);
    // First activity: the seeded visitor's session rolls, exactly as before #72.
    const active = ctx.ct.touchSession();
    expect(active.visitorId).toBe(VISITOR);
    expect(active.sessionId).not.toBe(SESSION);
    expect(active.sessionNumber).toBe('2');
  });

  it('is not called while consent is denied', () => {
    let calls = 0;
    let granted = false;
    const ctx = setup(
      { ...TIMING, seed: () => { calls++; return { visitorId: VISITOR, sessionId: SESSION }; } },
      { consent: () => granted },
    );
    ctx.ct.start();
    expect(ctx.ct.getSession({ passive: true })).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    expect(calls).toBe(0);
    granted = true;
    expect(ctx.ct.getSession({ passive: true })).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: '1' });
    expect(calls).toBe(1);
  });
});

describe('identity.visitorMaxAgeMs', () => {
  it('a seeded visitor created 364 days ago stays through its active last day and is replaced at day 365', () => {
    let seedNow = 0;
    const ctx = setup({
      ...TIMING,
      visitorMaxAgeMs: 365 * DAY,
      seed: () => ({ visitorId: VISITOR, visitorCreatedAt: seedNow - 364 * DAY }),
    });
    seedNow = ctx.now();
    ctx.ct.start();
    expect(ctx.ct.touchSession().visitorId).toBe(VISITOR);
    for (let hour = 1; hour < 24; hour++) {
      ctx.advance(HOUR);
      ctx.ct.track('page_view');
      expect(ctx.ct.getSession().visitorId).toBe(VISITOR);
    }
    ctx.advance(HOUR - 1);
    expect(ctx.ct.touchSession().visitorId).toBe(VISITOR);
    ctx.advance(1); // 365 days after visitorCreatedAt
    expect(ctx.ct.getSession({ passive: true })).toEqual({ visitorId: '', sessionId: '', sessionNumber: '' });
    const fresh = ctx.ct.touchSession();
    expect(fresh.visitorId).not.toBe(VISITOR);
    expect(fresh.visitorId).not.toBe('');
    expect(fresh.sessionNumber).toBe('1');
    expect(ctx.ct.getSession({ passive: true })).toEqual(fresh);
    expect(JSON.parse(ctx.mirror.map.get(SESSION_STATE_KEY)!)).toMatchObject({ visitor_created_at: ctx.now() });
  });

  it('keeps the visitor past 365 days when unset (default)', () => {
    const ctx = setup(TIMING);
    ctx.ct.start();
    const first = ctx.ct.touchSession();
    for (let day = 1; day <= 400; day++) {
      ctx.advance(DAY);
      expect(ctx.ct.touchSession().visitorId).toBe(first.visitorId);
    }
    expect(JSON.parse(ctx.mirror.map.get(SESSION_STATE_KEY)!)).not.toHaveProperty('visitor_created_at');
  });
});

describe('IdentitySeed.lastActivityAt', () => {
  it('a seed last active 1 h ago (idle 2 h) keeps its sessionId for one more hour without activity', () => {
    let seedNow = 0;
    const ctx = setup({
      ...TIMING,
      seed: () => ({ sessionId: SESSION, sessionStartedAt: seedNow - 3 * HOUR, lastActivityAt: seedNow - HOUR }),
    });
    seedNow = ctx.now();
    ctx.ct.start();
    expect(ctx.ct.getSession().sessionId).toBe(SESSION);
    ctx.advance(HOUR - 1);
    expect(ctx.ct.getSession().sessionId).toBe(SESSION);
    ctx.advance(1);
    const rolled = ctx.ct.getSession();
    expect(rolled.sessionId).not.toBe(SESSION);
    expect(rolled.sessionNumber).toBe('2');
  });

  it('without lastActivityAt the seeded session counts as active at adoption (unchanged)', () => {
    const ctx = setup({ ...TIMING, seed: () => ({ sessionId: SESSION }) });
    ctx.ct.start();
    expect(ctx.ct.getSession().sessionId).toBe(SESSION);
    ctx.advance(2 * HOUR - 1);
    expect(ctx.ct.getSession().sessionId).toBe(SESSION);
  });
});
