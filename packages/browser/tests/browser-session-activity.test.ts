/**
 * createClickTrail session activity (#63): touchSession(), identity.activityOnTrack,
 * getSession({ passive: true }) and IdentitySeed.lastActivityAt, replayed on
 * a fake clock.
 */
import { describe, expect, it } from 'vitest';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import type { ClickTrailIdentityConfig } from '../src/browser/create-clicktrail.js';
import { SESSION_STATE_KEY } from '../src/browser/storage.js';
import type { StorageAdapter } from '../src/browser/storage.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const SESSION = '7c1d4e2f-0a9b-4c8d-8e7f-6a5b4c3d2e1f';

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

  it('does not consult the seed; the first active read adopts it', () => {
    let calls = 0;
    const { ct } = setup({
      ...TIMING,
      seed: () => {
        calls++;
        return { sessionId: SESSION };
      },
    });
    ct.start();
    expect(ct.getSession({ passive: true }).sessionId).toBe('');
    expect(calls).toBe(0);
    expect(ct.touchSession().sessionId).toBe(SESSION);
    expect(ct.getSession({ passive: true }).sessionId).toBe(SESSION);
    expect(calls).toBe(1);
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
