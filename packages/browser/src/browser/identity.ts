/**
 * Visitor + session identity (Phase 2).
 *
 * Contract (portable prompt, "Identity and session rules"):
 * - stable visitor identity, maintained separately from attribution
 * - session identity is browser-owned: session_id always originates here,
 *   never derived from a server-side cookie
 * - 30-minute inactivity timeout rolls a new session (host-configurable),
 *   plus an optional maximum session length
 * - a host may seed its existing first-party IDs once, before ClickTrail
 *   mints any identity (migration); an existing identity is never replaced
 *
 * Determinism seams: randomness and the clock enter as injected functions.
 * `rollSession` is a PURE function exported for table-driven tests.
 */
import {
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from './storage.js';
import type { StorageAdapter } from './storage.js';

/** Default inactivity timeout: 30 minutes. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Injected random-byte source (e.g. crypto.getRandomValues.bind(crypto)). */
export type RandomBytesFn = (byteLength: number) => Uint8Array;

/** Format 16 random bytes as an RFC 4122 version-4 UUID string. */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('uuidV4FromBytes needs 16 bytes');
  const b = bytes.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}` +
    `-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/** Generate a visitor/session ID from the injected random source. */
export function generateId(randomBytes: RandomBytesFn): string {
  return uuidV4FromBytes(randomBytes(16));
}

/**
 * PURE: should this session roll?
 *
 * Rules:
 * - no prior activity (`lastEventTs === null`) => roll (fresh session)
 * - max length reached (`maxMs` set and
 *   now - sessionStartedAt >= maxMs)            => roll (boundary rolls)
 * - elapsed >= timeoutMs            => roll (inactivity timeout reached;
 *                                      the boundary instant rolls)
 * - clock skew (now < lastEventTs / now < sessionStartedAt) => do NOT roll
 *   on that rule; the visitor is active
 */
export function rollSession(input: {
  lastEventTs: number | null;
  now: number;
  timeoutMs: number;
  /** Session start in ms since epoch; required for the max-length rule. */
  sessionStartedAt?: number | null;
  /** Maximum session length. Default: none. */
  maxMs?: number;
}): boolean {
  const { lastEventTs, now, timeoutMs, sessionStartedAt, maxMs } = input;
  if (lastEventTs === null) return true;
  if (
    maxMs !== undefined &&
    sessionStartedAt !== undefined &&
    sessionStartedAt !== null &&
    now >= sessionStartedAt &&
    now - sessionStartedAt >= maxMs
  ) {
    return true;
  }
  if (now < lastEventTs) return false;
  return now - lastEventTs >= timeoutMs;
}

/** Structured session state persisted under `ct_session`. */
export interface StoredSessionState {
  session_id: string;
  session_number: number;
  /**
   * Session start in ms since epoch (plugin field name). States written
   * before this field existed backfill it from `last_event_ts` on read.
   */
  session_started_at: number;
  /** Last observed activity in ms since epoch. */
  last_event_ts: number;
}

/**
 * Host-owned identity to adopt instead of minting fresh IDs (migration from
 * the plugin or a host tracker). Every field is optional; a provided field
 * must be valid or the whole seed is rejected.
 */
export interface IdentitySeed {
  /** 8-128 chars of `[A-Za-z0-9_.:-]`, starting alphanumeric (UUIDs pass). */
  visitorId?: string;
  /** Same format as `visitorId`. */
  sessionId?: string;
  /** Start of the seeded session, ms since epoch; not in the future. Requires `sessionId`. */
  sessionStartedAt?: number;
}

/** Called at most once per store, only when no identity is stored. */
export type IdentitySeedFn = () => IdentitySeed | null | undefined;

const SEED_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

export interface IdentitySnapshot {
  visitorId: string;
  sessionId: string;
  sessionNumber: number;
}

export interface IdentityStoreConfig {
  /** Adapter the identity state persists through (localStorage mirror). */
  adapter: StorageAdapter;
  randomBytes: RandomBytesFn;
  nowMs: () => number;
  /** Inactivity timeout. Default: 30 minutes. */
  timeoutMs?: number;
  /** Maximum session length since `session_started_at`. Default: none. */
  maxMs?: number;
  /** Host identity adopted when storage holds no identity (see IdentitySeed). */
  seed?: IdentitySeedFn;
  /** Receives the reason when a seed is rejected (threw or failed validation). */
  onSeedRejected?: (reason: string) => void;
}

export interface IdentityStore {
  /**
   * Load-or-roll current identity and refresh the stored snapshot.
   * Adopts the host seed when no identity is stored; rolls when there is no
   * stored state, the inactivity timeout elapsed, or the maximum session
   * length was reached; otherwise keeps session_id/session_number.
   */
  current(): IdentitySnapshot;
  /** Record activity now (extends the inactivity window without rolling). */
  touch(): void;
  /** Remove every persisted identity key (consent denial / withdrawal). */
  clear(): void;
}

function readStoredSession(adapter: StorageAdapter): StoredSessionState | null {
  const raw = adapter.get(SESSION_STATE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    const sessionId = rec['session_id'];
    const sessionNumber = rec['session_number'];
    const lastEventTs = rec['last_event_ts'];
    const startedAt = rec['session_started_at'];
    if (typeof sessionId !== 'string' || sessionId === '') return null;
    if (typeof sessionNumber !== 'number' || !Number.isInteger(sessionNumber)) return null;
    if (typeof lastEventTs !== 'number') return null;
    return {
      session_id: sessionId,
      session_number: sessionNumber,
      session_started_at:
        typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : lastEventTs,
      last_event_ts: lastEventTs,
    };
  } catch {
    return null;
  }
}

function persist(adapter: StorageAdapter, state: StoredSessionState, visitorId: string): void {
  adapter.set(SESSION_STATE_KEY, JSON.stringify(state));
  adapter.set(VISITOR_ID_FALLBACK_KEY, visitorId);
  adapter.set(SESSION_ID_FALLBACK_KEY, state.session_id);
}

/**
 * Validate a host seed. Returns null when there is nothing to adopt; calls
 * `reject` (and returns null) when the seed threw or a field is invalid.
 */
function acceptSeed(
  seed: IdentitySeedFn,
  now: number,
  reject: (reason: string) => void,
): IdentitySeed | null {
  let raw: unknown;
  try {
    raw = seed();
  } catch {
    reject('identity seed threw; minting fresh identity.');
    return null;
  }
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') {
    reject('identity seed must return an object or null.');
    return null;
  }
  const { visitorId, sessionId, sessionStartedAt } = raw as Record<string, unknown>;
  for (const [name, value] of [['visitorId', visitorId], ['sessionId', sessionId]] as const) {
    if (value !== undefined && (typeof value !== 'string' || !SEED_ID_PATTERN.test(value))) {
      reject(`identity seed ${name} is not 8-128 chars of [A-Za-z0-9_.:-].`);
      return null;
    }
  }
  if (sessionStartedAt !== undefined) {
    if (sessionId === undefined) {
      reject('identity seed sessionStartedAt requires sessionId.');
      return null;
    }
    if (
      typeof sessionStartedAt !== 'number' ||
      !Number.isFinite(sessionStartedAt) ||
      sessionStartedAt < 0 ||
      sessionStartedAt > now
    ) {
      reject('identity seed sessionStartedAt must be epoch ms, not in the future.');
      return null;
    }
  }
  if (visitorId === undefined && sessionId === undefined) return null;
  return {
    ...(visitorId !== undefined ? { visitorId: visitorId as string } : {}),
    ...(sessionId !== undefined ? { sessionId: sessionId as string } : {}),
    ...(sessionStartedAt !== undefined ? { sessionStartedAt: sessionStartedAt as number } : {}),
  };
}

/**
 * Browser-owned identity store over one adapter. The visitor_id survives
 * session rolls and even mirror expiry via the lightweight `ct_visitor_id`
 * fallback (DATA-MODEL.md:233/:245); it is regenerated only when both are
 * gone. Identifiers exist only after first use and vanish on clear()
 * (consent denial), per DATA-MODEL.md:246. A host seed is consulted only on
 * the first identity read, so a later clear() cannot resurrect host IDs.
 */
export function createIdentityStore(config: IdentityStoreConfig): IdentityStore {
  const adapter = config.adapter;
  const randomBytes = config.randomBytes;
  const nowMs = config.nowMs;
  const timeoutMs = config.timeoutMs ?? SESSION_TIMEOUT_MS;
  const maxMs = config.maxMs;
  const seed = config.seed;
  const onSeedRejected = config.onSeedRejected ?? (() => undefined);
  let seedConsulted = seed === undefined;

  let cachedVisitorId: string | null = null;

  const resolveVisitorId = (stored: StoredSessionState | null): string => {
    if (cachedVisitorId !== null) return cachedVisitorId;
    if (stored !== null && stored.session_id !== '') {
      // visitor_id rides the structured state; fall back to the lightweight
      // key when the richer entry was discarded/expired.
      cachedVisitorId = adapter.get(VISITOR_ID_FALLBACK_KEY) ?? '';
      if (cachedVisitorId !== '') return cachedVisitorId;
    }
    cachedVisitorId = generateId(randomBytes);
    return cachedVisitorId;
  };

  return {
    current(): IdentitySnapshot {
      const now = nowMs();
      let stored = readStoredSession(adapter);
      let seeded = false;
      // Only the first identity read may seed: once this store has seen or
      // minted an identity, a later clear() must not bring host IDs back.
      if (!seedConsulted) {
        seedConsulted = true;
        const empty =
          stored === null &&
          cachedVisitorId === null &&
          adapter.get(VISITOR_ID_FALLBACK_KEY) === null;
        const accepted = empty ? acceptSeed(seed!, now, onSeedRejected) : null;
        if (accepted !== null) {
          seeded = true;
          if (accepted.visitorId !== undefined) cachedVisitorId = accepted.visitorId;
          if (accepted.sessionId !== undefined) {
            stored = {
              session_id: accepted.sessionId,
              session_number: 1,
              session_started_at: accepted.sessionStartedAt ?? now,
              last_event_ts: now,
            };
          }
        }
      }
      const visitorId = resolveVisitorId(stored);
      if (
        stored === null ||
        rollSession({
          lastEventTs: stored.last_event_ts,
          now,
          timeoutMs,
          sessionStartedAt: stored.session_started_at,
          ...(maxMs !== undefined ? { maxMs } : {}),
        })
      ) {
        const next: StoredSessionState = {
          session_id: generateId(randomBytes),
          session_number: (stored?.session_number ?? 0) + 1,
          session_started_at: now,
          last_event_ts: now,
        };
        persist(adapter, next, visitorId);
        return { visitorId, sessionId: next.session_id, sessionNumber: next.session_number };
      }
      if (seeded) persist(adapter, stored, visitorId);
      return { visitorId, sessionId: stored.session_id, sessionNumber: stored.session_number };
    },

    touch(): void {
      const stored = readStoredSession(adapter);
      if (stored === null) return;
      const visitorId = resolveVisitorId(stored);
      persist(adapter, { ...stored, last_event_ts: nowMs() }, visitorId);
    },

    clear(): void {
      cachedVisitorId = null;
      adapter.delete(SESSION_STATE_KEY);
      adapter.delete(VISITOR_ID_FALLBACK_KEY);
      adapter.delete(SESSION_ID_FALLBACK_KEY);
    },
  };
}
