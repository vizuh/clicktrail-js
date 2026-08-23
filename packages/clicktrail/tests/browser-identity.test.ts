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
