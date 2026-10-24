/**
 * Identity: pure rollSession table, deterministic UUID v4 from injected
 * bytes, visitor persistence across session rolls, clear() semantics.
 */
import { describe, expect, it } from 'vitest';
import {
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from '../src/browser/storage.js';
import {
  createIdentityStore,
  generateId,
  rollSession,
  uuidV4FromBytes,
} from '../src/browser/identity.js';

function fakeAdapter() {
  const map = new Map<string, string>();
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v); },
    delete: (k: string) => { map.delete(k); },
  };
}

/** Deterministic byte source: yields the queued chunks in order. */
function fixedRandomBytes(chunks: Uint8Array[]): (n: number) => Uint8Array {
  let i = 0;
  return (n: number) => {
    const chunk = chunks[i++]!;
    expect(chunk.length).toBe(n);
    return chunk;
  };
}

describe('rollSession (pure, table-driven)', () => {
  const TIMEOUT = 30 * 60 * 1000;
  const table: { name: string; lastEventTs: number | null; now: number; timeoutMs: number; rolls: boolean }[] = [
    { name: 'no prior activity -> roll', lastEventTs: null, now: 5_000, timeoutMs: TIMEOUT, rolls: true },
    { name: 'well within window -> keep', lastEventTs: 0, now: TIMEOUT - 1, timeoutMs: TIMEOUT, rolls: false },
    { name: 'exactly at timeout -> roll', lastEventTs: 0, now: TIMEOUT, timeoutMs: TIMEOUT, rolls: true },
    { name: 'just past timeout -> roll', lastEventTs: 0, now: TIMEOUT + 1, timeoutMs: TIMEOUT, rolls: true },
    { name: 'far past timeout -> roll', lastEventTs: 0, now: 10 * TIMEOUT, timeoutMs: TIMEOUT, rolls: true },
    { name: 'zero timeout always rolls', lastEventTs: 1_000, now: 1_000, timeoutMs: 0, rolls: true },
    { name: 'clock skew does not roll', lastEventTs: 2_000, now: 1_000, timeoutMs: TIMEOUT, rolls: false },
    { name: 'custom timeout respected', lastEventTs: 0, now: 10_000, timeoutMs: 9_999, rolls: true },
    { name: 'just inside custom timeout', lastEventTs: 0, now: 9_998, timeoutMs: 9_999, rolls: false },
    { name: 'custom timeout boundary', lastEventTs: 0, now: 10_000, timeoutMs: 10_000, rolls: true },
  ];
  for (const c of table) {
    it(c.name, () => {
      expect(rollSession({ lastEventTs: c.lastEventTs, now: c.now, timeoutMs: c.timeoutMs })).toBe(c.rolls);
    });
  }
});

describe('uuidV4FromBytes / generateId', () => {
  it('formats fixed injected bytes deterministically with v4 bits set', () => {
    const bytes = new Uint8Array(16).map((_, i) => (i * 17 + 3) & 0xff);
    const id = uuidV4FromBytes(bytes);
    // Version nibble and RFC-4122 variant are forced regardless of input.
    expect(id[14]).toBe('4');
    expect(id[19]).toMatch(/[89ab]/);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Same bytes in, same UUID out.
    expect(uuidV4FromBytes(bytes)).toBe(id);
  });

  it('rejects short byte inputs', () => {
    expect(() => uuidV4FromBytes(new Uint8Array(15))).toThrow();
  });

  it('generateId consumes exactly 16 bytes per ID', () => {
    let calls = 0;
    let seq = 0;
    const id = generateId((n) => {
      calls++;
      expect(n).toBe(16);
      return new Uint8Array(16).fill((seq++) & 0xff);
    });
    expect(calls).toBe(1);
    expect(id).toHaveLength(36);
  });
});

describe('createIdentityStore', () => {
  const BYTES_A = new Uint8Array(16).fill(0xaa);
  const BYTES_B = new Uint8Array(16).fill(0xbb);

  it('creates a fresh visitor + session #1 on first use (deterministic given fixed randomness)', () => {
    let now = 1_000;
    const adapter = fakeAdapter();
    const store = createIdentityStore({
      adapter,
      randomBytes: fixedRandomBytes([BYTES_A, BYTES_B]),
      nowMs: () => now,
    });
    const snap = store.current();
    expect(snap.visitorId).toBe(uuidV4FromBytes(BYTES_A));
    expect(snap.sessionId).toBe(uuidV4FromBytes(BYTES_B));
    expect(snap.sessionNumber).toBe(1);
  });

  it('keeps the same session inside the inactivity window', () => {
    let now = 1_000;
    const adapter = fakeAdapter();
    let call = 0;
    const store = createIdentityStore({
      adapter,
      randomBytes: () => (call++ < 2 ? BYTES_A : BYTES_B),
      nowMs: () => now,
    });
    const first = store.current();
    now += 29 * 60 * 1000; // still inside 30 minutes
    const second = store.current();
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.visitorId).toBe(first.visitorId);
    expect(second.sessionNumber).toBe(1);
  });

  it('rolls a new session after 30 idle minutes but keeps the visitor_id', () => {
    let now = 0;
    const adapter = fakeAdapter();
    const chunks = [new Uint8Array(16).fill(1), new Uint8Array(16).fill(2), new Uint8Array(16).fill(3)];
    const store = createIdentityStore({ adapter, randomBytes: fixedRandomBytes(chunks), nowMs: () => now });
    const first = store.current();
    now += 31 * 60 * 1000;
    const second = store.current();
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.sessionNumber).toBe(2);
    expect(second.visitorId).toBe(first.visitorId);
  });

  it('recovers the visitor_id from the lightweight fallback when the rich entry is gone', () => {
    let now = 0;
    const adapter = fakeAdapter();
    const chunks = [new Uint8Array(16).fill(7), new Uint8Array(16).fill(8), new Uint8Array(16).fill(9)];
    const store = createIdentityStore({ adapter, randomBytes: fixedRandomBytes(chunks), nowMs: () => now });
    const first = store.current();

    // Simulate mirror expiry of ct_session only.
    adapter.delete(SESSION_STATE_KEY);
    now += 31 * 60 * 1000;
    const second = store.current();
    expect(second.visitorId).toBe(first.visitorId);
    expect(second.sessionNumber).toBe(1); // no prior session state survived
  });

  it('touch() extends the inactivity window without rolling or burning randomness', () => {
    let now = 0;
    const adapter = fakeAdapter();
    let calls = 0;
    const store = createIdentityStore({ adapter, randomBytes: () => { calls++; return new Uint8Array(16).fill(1); }, nowMs: () => now });
    const first = store.current();
    const afterCreate = calls;

    now += 20 * 60 * 1000;
    store.touch();
    now += 20 * 60 * 1000; // 40 min since creation, 20 min since touch
    const later = store.current();
    expect(later.sessionId).toBe(first.sessionId);
    expect(later.sessionNumber).toBe(1);
    expect(calls).toBe(afterCreate);
  });

  it('clear() removes every identity key so the next use starts clean', () => {
    const adapter = fakeAdapter();
    const chunks = [
      new Uint8Array(16).fill(1),
      new Uint8Array(16).fill(2),
      new Uint8Array(16).fill(3),
      new Uint8Array(16).fill(4),
    ];
    const store = createIdentityStore({ adapter, randomBytes: fixedRandomBytes(chunks), nowMs: () => 0 });
    store.current();
    expect(adapter.map.size).toBeGreaterThan(0);

    store.clear();
    for (const key of [SESSION_STATE_KEY, VISITOR_ID_FALLBACK_KEY, SESSION_ID_FALLBACK_KEY]) {
      expect(adapter.map.has(key)).toBe(false);
    }
    const fresh = store.current();
    expect(fresh.sessionNumber).toBe(1);
    // Cached visitor was dropped with clear(): the third queued chunk is
    // consumed as a brand-new visitor id.
    expect(fresh.visitorId).toBe(uuidV4FromBytes(new Uint8Array(16).fill(3)));
    expect(fresh.sessionId).toBe(uuidV4FromBytes(new Uint8Array(16).fill(4)));
  });
});

describe('rollSession max length (pure, table-driven)', () => {
  const IDLE = 2 * 60 * 60 * 1000;
  const MAX = 24 * 60 * 60 * 1000;
  const table: {
    name: string;
    lastEventTs: number;
    sessionStartedAt: number | null;
    now: number;
    maxMs: number | undefined;
    rolls: boolean;
  }[] = [
    { name: 'active, inside max -> keep', lastEventTs: MAX - 10, sessionStartedAt: 0, now: MAX - 1, maxMs: MAX, rolls: false },
    { name: 'active, exactly at max -> roll', lastEventTs: MAX - 10, sessionStartedAt: 0, now: MAX, maxMs: MAX, rolls: true },
    { name: 'active, past max -> roll', lastEventTs: MAX, sessionStartedAt: 0, now: MAX + 1, maxMs: MAX, rolls: true },
    { name: 'no max configured -> idle rule only', lastEventTs: 5 * MAX, sessionStartedAt: 0, now: 5 * MAX + 1, maxMs: undefined, rolls: false },
    { name: 'unknown start -> idle rule only', lastEventTs: 5 * MAX, sessionStartedAt: null, now: 5 * MAX + 1, maxMs: MAX, rolls: false },
    { name: 'start in the future (skew) -> no max roll', lastEventTs: 0, sessionStartedAt: 10, now: 5, maxMs: 1, rolls: false },
    { name: 'idle still rolls inside max', lastEventTs: 0, sessionStartedAt: 0, now: IDLE, maxMs: MAX, rolls: true },
  ];
  for (const c of table) {
    it(c.name, () => {
      expect(
        rollSession({
          lastEventTs: c.lastEventTs,
          now: c.now,
          timeoutMs: IDLE,
          sessionStartedAt: c.sessionStartedAt,
          ...(c.maxMs !== undefined ? { maxMs: c.maxMs } : {}),
        }),
      ).toBe(c.rolls);
    });
  }
});

describe('createIdentityStore session timing', () => {
  const MIN = 60 * 1000;

  it('uses a custom idle timeout', () => {
    let now = 0;
    let n = 0;
    const store = createIdentityStore({
      adapter: fakeAdapter(),
      randomBytes: () => new Uint8Array(16).fill(n++),
      nowMs: () => now,
      timeoutMs: 120 * MIN,
    });
    const first = store.current();
    now += 119 * MIN;
    expect(store.current().sessionId).toBe(first.sessionId);
    now += 2 * MIN; // 121 min since the last recorded activity (current() is not activity)
    const rolled = store.current();
    expect(rolled.sessionNumber).toBe(2);
    expect(rolled.visitorId).toBe(first.visitorId);
  });

  it('rolls at the maximum session length even while active', () => {
    let now = 0;
    let n = 0;
    const store = createIdentityStore({
      adapter: fakeAdapter(),
      randomBytes: () => new Uint8Array(16).fill(n++),
      nowMs: () => now,
      timeoutMs: 120 * MIN,
      maxMs: 24 * 60 * MIN,
    });
    const first = store.current();
    for (let i = 0; i < 23; i++) {
      now += 60 * MIN;
      store.touch();
    }
    now += 59 * MIN;
    expect(store.current().sessionId).toBe(first.sessionId);
    now += MIN; // exactly 24 h after session start
    const rolled = store.current();
    expect(rolled.sessionId).not.toBe(first.sessionId);
    expect(rolled.sessionNumber).toBe(2);
    expect(rolled.visitorId).toBe(first.visitorId);
  });

  it('persists session_started_at and backfills it from last_event_ts for older states', () => {
    let now = 1_000;
    const adapter = fakeAdapter();
    adapter.set(SESSION_STATE_KEY, JSON.stringify({ session_id: 'legacy-session', session_number: 3, last_event_ts: 1_000 }));
    adapter.set(VISITOR_ID_FALLBACK_KEY, 'legacy-visitor');
    const store = createIdentityStore({
      adapter,
      randomBytes: () => new Uint8Array(16).fill(9),
      nowMs: () => now,
      maxMs: 10_000,
    });
    now = 5_000;
    store.touch();
    expect(JSON.parse(adapter.map.get(SESSION_STATE_KEY)!)).toEqual({
      session_id: 'legacy-session',
      session_number: 3,
      session_started_at: 1_000,
      last_event_ts: 5_000,
    });
    now = 11_000; // 10 s after the backfilled start
    const rolled = store.current();
    expect(rolled.sessionNumber).toBe(4);
    expect(rolled.visitorId).toBe('legacy-visitor');
    expect(JSON.parse(adapter.map.get(SESSION_STATE_KEY)!).session_started_at).toBe(11_000);
  });
});

describe('createIdentityStore seed', () => {
  const VISITOR = '3f0b2c9e-6a1d-4b7e-9c2a-8d5e4f1a2b3c';
  const SESSION = '7c1d4e2f-0a9b-4c8d-8e7f-6a5b4c3d2e1f';

  function seededStore(seed: () => unknown, opts: { now?: () => number; maxMs?: number } = {}) {
    const adapter = fakeAdapter();
    const rejected: string[] = [];
    let calls = 0;
    const store = createIdentityStore({
      adapter,
      randomBytes: () => new Uint8Array(16).fill(0x5a),
      nowMs: opts.now ?? (() => 10_000),
      ...(opts.maxMs !== undefined ? { maxMs: opts.maxMs } : {}),
      seed: () => {
        calls++;
        return seed() as never;
      },
      onSeedRejected: (reason) => rejected.push(reason),
    });
    return { adapter, store, rejected, calls: () => calls };
  }

  it('adopts a valid seed once and persists it like a minted identity', () => {
    const { adapter, store, calls } = seededStore(() => ({ visitorId: VISITOR, sessionId: SESSION, sessionStartedAt: 4_000 }));
    expect(store.current()).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: 1 });
    expect(store.current()).toEqual({ visitorId: VISITOR, sessionId: SESSION, sessionNumber: 1 });
    expect(calls()).toBe(1);
    expect(adapter.map.get(VISITOR_ID_FALLBACK_KEY)).toBe(VISITOR);
    expect(adapter.map.get(SESSION_ID_FALLBACK_KEY)).toBe(SESSION);
    expect(JSON.parse(adapter.map.get(SESSION_STATE_KEY)!)).toEqual({
      session_id: SESSION,
      session_number: 1,
      session_started_at: 4_000,
      last_event_ts: 10_000,
    });
  });

  it('accepts plugin-style fallback IDs', () => {
    const { store } = seededStore(() => ({ visitorId: 'vis_0123456789abcdef', sessionId: 'sess_0123456789abcdef' }));
    expect(store.current()).toMatchObject({ visitorId: 'vis_0123456789abcdef', sessionId: 'sess_0123456789abcdef' });
  });

  it('visitor-only seed keeps the visitor and mints a session', () => {
    const { store } = seededStore(() => ({ visitorId: VISITOR }));
    const snap = store.current();
    expect(snap.visitorId).toBe(VISITOR);
    expect(snap.sessionId).toBe(uuidV4FromBytes(new Uint8Array(16).fill(0x5a)));
    expect(snap.sessionNumber).toBe(1);
  });

  it('never calls the seed when a ClickTrail identity already exists', () => {
    const { adapter, store, calls } = seededStore(() => ({ visitorId: VISITOR, sessionId: SESSION }));
    adapter.set(SESSION_STATE_KEY, JSON.stringify({ session_id: 'existing-session', session_number: 2, last_event_ts: 9_000 }));
    adapter.set(VISITOR_ID_FALLBACK_KEY, 'existing-visitor');
    expect(store.current()).toEqual({ visitorId: 'existing-visitor', sessionId: 'existing-session', sessionNumber: 2 });
    expect(calls()).toBe(0);
  });

  it('never calls the seed when only the visitor fallback key exists', () => {
    const { adapter, store, calls } = seededStore(() => ({ visitorId: VISITOR }));
    adapter.set(VISITOR_ID_FALLBACK_KEY, 'existing-visitor');
    store.current();
    expect(calls()).toBe(0);
  });

  it('a seeded session already past the max length rolls to session #2 for the seeded visitor', () => {
    const { store } = seededStore(() => ({ visitorId: VISITOR, sessionId: SESSION, sessionStartedAt: 0 }), { maxMs: 10_000 });
    const snap = store.current();
    expect(snap.visitorId).toBe(VISITOR);
    expect(snap.sessionId).not.toBe(SESSION);
    expect(snap.sessionNumber).toBe(2);
  });

  const invalid: { name: string; seed: unknown }[] = [
    { name: 'too short', seed: { visitorId: 'abc' } },
    { name: 'illegal characters', seed: { visitorId: 'visitor id with spaces' } },
    { name: 'non-string id', seed: { sessionId: 12345678 } },
    { name: 'leading separator', seed: { visitorId: '_abcdefghij' } },
    { name: 'too long', seed: { visitorId: 'a'.repeat(129) } },
    { name: 'future last activity', seed: { sessionId: SESSION, lastActivityAt: 10_001 } },
    { name: 'negative last activity', seed: { sessionId: SESSION, lastActivityAt: -1 } },
    { name: 'last activity without session', seed: { visitorId: VISITOR, lastActivityAt: 1 } },
    { name: 'last activity before start', seed: { sessionId: SESSION, sessionStartedAt: 5_000, lastActivityAt: 4_999 } },
    { name: 'future start', seed: { sessionId: SESSION, sessionStartedAt: 10_001 } },
    { name: 'non-finite start', seed: { sessionId: SESSION, sessionStartedAt: Number.NaN } },
    { name: 'start without session', seed: { visitorId: VISITOR, sessionStartedAt: 1 } },
    { name: 'non-object', seed: 'visitor' },
  ];
  for (const c of invalid) {
    it(`rejects the whole seed (${c.name}) and mints fresh IDs`, () => {
      const { store, rejected } = seededStore(() => c.seed);
      const snap = store.current();
      expect(snap.visitorId).toBe(uuidV4FromBytes(new Uint8Array(16).fill(0x5a)));
      expect(snap.visitorId).not.toBe(VISITOR);
      expect(rejected).toHaveLength(1);
    });
  }

  it('a throwing seed is rejected without breaking identity', () => {
    const { store, rejected } = seededStore(() => {
      throw new Error('host cookie unreadable');
    });
    expect(store.current().sessionNumber).toBe(1);
    expect(rejected).toEqual(['identity seed threw; minting fresh identity.']);
  });

  it('null / empty seeds mint fresh IDs without a rejection', () => {
    for (const value of [null, undefined, {}]) {
      const { store, rejected, calls } = seededStore(() => value);
      expect(store.current().visitorId).toBe(uuidV4FromBytes(new Uint8Array(16).fill(0x5a)));
      expect(rejected).toHaveLength(0);
      expect(calls()).toBe(1);
    }
  });

  it('is not consulted again after clear() (withdrawal cannot resurrect host IDs)', () => {
    const { store, calls } = seededStore(() => ({ visitorId: VISITOR, sessionId: SESSION }));
    expect(store.current().visitorId).toBe(VISITOR);
    store.clear();
    expect(store.current().visitorId).not.toBe(VISITOR);
    expect(calls()).toBe(1);
  });
});

describe('createIdentityStore activity and passive reads', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  function store(opts: { timeoutMs?: number; maxMs?: number; seed?: () => unknown } = {}) {
    let now = 1_700_000_000_000;
    let n = 0;
    const adapter = fakeAdapter();
    const s = createIdentityStore({
      adapter,
      randomBytes: () => new Uint8Array(16).fill(++n),
      nowMs: () => now,
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.maxMs !== undefined ? { maxMs: opts.maxMs } : {}),
      ...(opts.seed !== undefined ? { seed: opts.seed as never } : {}),
    });
    return {
      adapter,
      store: s,
      advance: (ms: number) => { now += ms; },
      now: () => now,
      randomCalls: () => n,
    };
  }

  it('touch() on an empty store creates the session and returns it', () => {
    const { adapter, store: s } = store();
    const snap = s.touch();
    expect(snap.sessionNumber).toBe(1);
    expect(JSON.parse(adapter.map.get(SESSION_STATE_KEY)!).session_id).toBe(snap.sessionId);
  });

  it('touch() rolls an expired session instead of reviving it', () => {
    const { store: s, advance } = store();
    const first = s.current();
    advance(31 * MIN);
    const touched = s.touch();
    expect(touched.sessionId).not.toBe(first.sessionId);
    expect(touched.sessionNumber).toBe(2);
    expect(touched.visitorId).toBe(first.visitorId);
  });

  it('touch() never moves last_event_ts backwards on clock skew', () => {
    const { adapter, store: s, advance, now } = store();
    s.current();
    const createdAt = now();
    advance(-5 * MIN);
    s.touch();
    expect(JSON.parse(adapter.map.get(SESSION_STATE_KEY)!).last_event_ts).toBe(createdAt);
  });

  it('peek() never writes, never mints, and empties an expired session', () => {
    const { adapter, store: s, advance, randomCalls } = store({ timeoutMs: 2 * HOUR });
    expect(s.peek()).toEqual({ visitorId: '', sessionId: '', sessionNumber: null });
    expect(adapter.map.size).toBe(0);
    expect(randomCalls()).toBe(0);

    const live = s.current();
    const before = new Map(adapter.map);
    advance(2 * HOUR - 1);
    expect(s.peek()).toEqual({ visitorId: live.visitorId, sessionId: live.sessionId, sessionNumber: 1 });
    advance(1);
    expect(s.peek()).toEqual({ visitorId: live.visitorId, sessionId: '', sessionNumber: null });
    expect(adapter.map).toEqual(before);
    expect(randomCalls()).toBe(2);
  });

  it('peek() does not consult the seed', () => {
    let calls = 0;
    const { store: s } = store({ seed: () => { calls++; return { visitorId: 'host-visitor-0001' }; } });
    expect(s.peek().visitorId).toBe('');
    expect(calls).toBe(0);
    expect(s.current().visitorId).toBe('host-visitor-0001');
    expect(calls).toBe(1);
  });

  it('a seed with lastActivityAt keeps its own idle clock (start defaults to it)', () => {
    const SESSION = '7c1d4e2f-0a9b-4c8d-8e7f-6a5b4c3d2e1f';
    let seedAt = 0;
    const ctx = store({
      timeoutMs: 2 * HOUR,
      seed: () => ({ sessionId: SESSION, lastActivityAt: seedAt }),
    });
    seedAt = ctx.now() - HOUR;
    expect(ctx.store.current().sessionId).toBe(SESSION);
    expect(JSON.parse(ctx.adapter.map.get(SESSION_STATE_KEY)!)).toMatchObject({
      session_id: SESSION,
      session_started_at: seedAt,
      last_event_ts: seedAt,
    });
  });
});
