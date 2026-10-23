/**
 * Visitor + session identity (Phase 2).
 *
 * Contract (portable prompt, "Identity and session rules"):
 * - stable visitor identity, maintained separately from attribution
 * - session identity is browser-owned: session_id always originates here,
 *   never derived from a server-side cookie
 * - 30-minute inactivity timeout rolls a new session (host-configurable),
 *   plus an optional maximum session length
 * - optional fixed visitor lifetime counted from the visitor's creation
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
  /**
   * Creation of the visitor this session belongs to, ms since epoch. Written
   * only when `visitorMaxAgeMs` is configured or a seed supplied
   * `visitorCreatedAt`; carried across session rolls.
   */
  visitor_created_at?: number;
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
  /**
   * Last activity in the seeded session, ms since epoch; not in the future
   * and not before `sessionStartedAt`. Requires `sessionId`. The idle
   * timeout counts from here instead of from adoption. When
   * `sessionStartedAt` is omitted the session is taken to start here.
   */
  lastActivityAt?: number;
  /**
   * Creation of the seeded visitor, ms since epoch; not in the future.
   * Requires `visitorId`. `visitorMaxAgeMs` counts from here.
   */
  visitorCreatedAt?: number;
}

/** Called at most once per store, only when no identity is stored. */
export type IdentitySeedFn = () => IdentitySeed | null | undefined;

const SEED_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

export interface IdentitySnapshot {
  visitorId: string;
  sessionId: string;
  sessionNumber: number;
}

/** Read-only view of stored identity (see IdentityStore.peek). */
export interface PassiveIdentitySnapshot {
  /** '' when no identity is stored. */
  visitorId: string;
  /** '' when no session is stored or the stored session has expired. */
  sessionId: string;
  /** null whenever `sessionId` is ''. */
  sessionNumber: number | null;
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
  /**
   * Fixed visitor lifetime since `visitor_created_at`: once reached, the
   * next non-passive read mints a new visitor (and session 1) and passive
   * reads return no visitor. Activity does not extend it. Default: none.
   */
  visitorMaxAgeMs?: number;
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
   * length was reached; otherwise keeps session_id/session_number. Does not
   * count as activity.
   */
  current(): IdentitySnapshot;
  /**
   * Record activity now: load-or-roll exactly like current(), then move
   * `last_event_ts` to now so the inactivity window counts from this call.
   * Never extends a session that already expired (that one rolls first).
   */
  touch(): IdentitySnapshot;
  /**
   * Passive read: never mints IDs and never rolls or touches a session.
   * Returns an empty session when none is stored or it has expired, and no
   * visitor once `visitorMaxAgeMs` is reached. Consults the seed under the
   * same rules as current(): it returns what current() would keep from it
   * and persists the seed only when it yields a valid visitor and session;
   * otherwise the seed waits, unwritten, for the first non-passive read.
   */
  peek(): PassiveIdentitySnapshot;
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
    const visitorCreatedAt = rec['visitor_created_at'];
    if (typeof sessionId !== 'string' || sessionId === '') return null;
    if (typeof sessionNumber !== 'number' || !Number.isInteger(sessionNumber)) return null;
    if (typeof lastEventTs !== 'number') return null;
    return {
      session_id: sessionId,
      session_number: sessionNumber,
      session_started_at:
        typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : lastEventTs,
      last_event_ts: lastEventTs,
      ...(typeof visitorCreatedAt === 'number' && Number.isFinite(visitorCreatedAt)
        ? { visitor_created_at: visitorCreatedAt }
        : {}),
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
  const { visitorId, sessionId, sessionStartedAt, lastActivityAt, visitorCreatedAt } =
    raw as Record<string, unknown>;
  for (const [name, value] of [['visitorId', visitorId], ['sessionId', sessionId]] as const) {
    if (value !== undefined && (typeof value !== 'string' || !SEED_ID_PATTERN.test(value))) {
      reject(`identity seed ${name} is not 8-128 chars of [A-Za-z0-9_.:-].`);
      return null;
    }
  }
  for (const [name, value, owner, ownerName] of [
    ['sessionStartedAt', sessionStartedAt, sessionId, 'sessionId'],
    ['lastActivityAt', lastActivityAt, sessionId, 'sessionId'],
    ['visitorCreatedAt', visitorCreatedAt, visitorId, 'visitorId'],
  ] as const) {
    if (value === undefined) continue;
    if (owner === undefined) {
      reject(`identity seed ${name} requires ${ownerName}.`);
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > now) {
      reject(`identity seed ${name} must be epoch ms, not in the future.`);
      return null;
    }
  }
  if (
    sessionStartedAt !== undefined &&
    lastActivityAt !== undefined &&
    (lastActivityAt as number) < (sessionStartedAt as number)
  ) {
    reject('identity seed lastActivityAt must not be before sessionStartedAt.');
    return null;
  }
  if (visitorId === undefined && sessionId === undefined) return null;
  return {
    ...(visitorId !== undefined ? { visitorId: visitorId as string } : {}),
    ...(sessionId !== undefined ? { sessionId: sessionId as string } : {}),
    ...(sessionStartedAt !== undefined ? { sessionStartedAt: sessionStartedAt as number } : {}),
    ...(lastActivityAt !== undefined ? { lastActivityAt: lastActivityAt as number } : {}),
    ...(visitorCreatedAt !== undefined ? { visitorCreatedAt: visitorCreatedAt as number } : {}),
  };
}

/** A resolved visitor; `createdAt` is unknown for visitors stored without it. */
interface VisitorRecord {
  id: string;
  createdAt: number | undefined;
}

/**
 * Browser-owned identity store over one adapter. The visitor_id survives
 * session rolls and even mirror expiry via the lightweight `ct_visitor_id`
 * fallback (DATA-MODEL.md:233/:245); it is regenerated only when both are
 * gone or `visitorMaxAgeMs` is reached. Identifiers exist only after first
 * use and vanish on clear() (consent denial), per DATA-MODEL.md:246. A host
 * seed is consulted only on the first identity read, so a later clear()
 * cannot resurrect host IDs.
 */
export function createIdentityStore(config: IdentityStoreConfig): IdentityStore {
  const adapter = config.adapter;
  const randomBytes = config.randomBytes;
  const nowMs = config.nowMs;
  const timeoutMs = config.timeoutMs ?? SESSION_TIMEOUT_MS;
  const maxMs = config.maxMs;
  const visitorMaxAgeMs = config.visitorMaxAgeMs;
  const seed = config.seed;
  const onSeedRejected = config.onSeedRejected ?? (() => undefined);
  let seedConsulted = seed === undefined;
  /** Accepted seed a passive read could not fully adopt; consumed by resolve(). */
  let pendingSeed: IdentitySeed | null = null;

  let cachedVisitor: VisitorRecord | null = null;

  /** Stored (or cached) visitor without minting; null when none exists. */
  const loadVisitor = (stored: StoredSessionState | null): VisitorRecord | null => {
    if (cachedVisitor !== null) return cachedVisitor;
    if (stored === null || stored.session_id === '') return null;
    // visitor_id rides the structured state; fall back to the lightweight
    // key when the richer entry was discarded/expired.
    const id = adapter.get(VISITOR_ID_FALLBACK_KEY) ?? '';
    return id === '' ? null : { id, createdAt: stored.visitor_created_at };
  };

  /** Fixed lifetime reached; clock skew (now before creation) never expires. */
  const visitorExpired = (visitor: VisitorRecord, now: number): boolean =>
    visitorMaxAgeMs !== undefined &&
    visitor.createdAt !== undefined &&
    now >= visitor.createdAt &&
    now - visitor.createdAt >= visitorMaxAgeMs;

  const expired = (stored: StoredSessionState, now: number): boolean =>
    rollSession({
      lastEventTs: stored.last_event_ts,
      now,
      timeoutMs,
      sessionStartedAt: stored.session_started_at,
      ...(maxMs !== undefined ? { maxMs } : {}),
    });

  /**
   * The seed to adopt now, or null. The seed function runs at most once per
   * store, on the first identity read, and only when storage holds no
   * identity; an accepted seed stays pending (peek) until resolve() consumes
   * it, and is dropped once another identity appears.
   */
  const seedFor = (now: number, stored: StoredSessionState | null): IdentitySeed | null => {
    if (seedConsulted && pendingSeed === null) return null;
    const empty =
      stored === null && cachedVisitor === null && adapter.get(VISITOR_ID_FALLBACK_KEY) === null;
    if (!seedConsulted) {
      // Only the first identity read may seed: once this store has seen or
      // minted an identity, a later clear() must not bring host IDs back.
      seedConsulted = true;
      pendingSeed = empty ? acceptSeed(seed!, now, onSeedRejected) : null;
    } else if (!empty) {
      pendingSeed = null;
    }
    return pendingSeed;
  };

  /** Session state a seed's session translates to (not yet rolled). */
  const seededSession = (accepted: IdentitySeed, now: number): StoredSessionState | null =>
    accepted.sessionId === undefined
      ? null
      : {
          session_id: accepted.sessionId,
          session_number: 1,
          session_started_at: accepted.sessionStartedAt ?? accepted.lastActivityAt ?? now,
          last_event_ts: accepted.lastActivityAt ?? now,
        };

  /** `state` carrying the visitor's creation time; unchanged while it is unknown. */
  const withVisitor = (state: StoredSessionState, visitor: VisitorRecord): StoredSessionState =>
    visitor.createdAt === undefined ? state : { ...state, visitor_created_at: visitor.createdAt };

  /** Shared load-or-roll; `activity` also moves last_event_ts to now. */
  const resolve = (activity: boolean): IdentitySnapshot => {
    const now = nowMs();
    let stored = readStoredSession(adapter);
    let visitor: VisitorRecord | null;
    const accepted = seedFor(now, stored);
    pendingSeed = null;
    if (accepted !== null) {
      visitor =
        accepted.visitorId === undefined
          ? null
          : { id: accepted.visitorId, createdAt: accepted.visitorCreatedAt };
      stored = seededSession(accepted, now) ?? stored;
    } else {
      visitor = loadVisitor(stored);
    }
    if (visitor !== null && visitorExpired(visitor, now)) {
      // A new visitor starts its own session count.
      visitor = null;
      stored = null;
    }
    if (visitor === null) {
      visitor = {
        id: generateId(randomBytes),
        createdAt: visitorMaxAgeMs !== undefined ? now : undefined,
      };
    } else if (visitor.createdAt === undefined && visitorMaxAgeMs !== undefined) {
      // Visitors stored before the limit was enabled age from now.
      visitor = { id: visitor.id, createdAt: now };
    }
    cachedVisitor = visitor;
    if (stored === null || expired(stored, now)) {
      const next = withVisitor(
        {
          session_id: generateId(randomBytes),
          session_number: (stored?.session_number ?? 0) + 1,
          session_started_at: now,
          last_event_ts: now,
        },
        visitor,
      );
      persist(adapter, next, visitor.id);
      return { visitorId: visitor.id, sessionId: next.session_id, sessionNumber: next.session_number };
    }
    const state = withVisitor(stored, visitor);
    if (activity) {
      // Clock skew never moves the idle clock backwards.
      persist(adapter, { ...state, last_event_ts: Math.max(state.last_event_ts, now) }, visitor.id);
    } else if (accepted !== null || state.visitor_created_at !== stored.visitor_created_at) {
      persist(adapter, state, visitor.id);
    }
    return { visitorId: visitor.id, sessionId: state.session_id, sessionNumber: state.session_number };
  };

  return {
    current: () => resolve(false),

    touch: () => resolve(true),

    peek(): PassiveIdentitySnapshot {
      const now = nowMs();
      let stored = readStoredSession(adapter);
      let visitor: VisitorRecord | null;
      const accepted = seedFor(now, stored);
      if (accepted !== null) {
        visitor =
          accepted.visitorId === undefined
            ? null
            : { id: accepted.visitorId, createdAt: accepted.visitorCreatedAt };
        stored = seededSession(accepted, now);
      } else {
        visitor = loadVisitor(stored);
      }
      if (visitor !== null && visitorExpired(visitor, now)) {
        // resolve() would mint a new visitor and session; report neither.
        return { visitorId: '', sessionId: '', sessionNumber: null };
      }
      const visitorId = visitor?.id ?? '';
      if (stored === null || expired(stored, now)) {
        return { visitorId, sessionId: '', sessionNumber: null };
      }
      if (accepted !== null && visitor !== null) {
        // A complete, valid seeded identity: adopt it exactly as resolve()
        // would, since nothing has to be minted. The host already owns it.
        const adopted: VisitorRecord =
          visitor.createdAt === undefined && visitorMaxAgeMs !== undefined
            ? { id: visitor.id, createdAt: now }
            : visitor;
        persist(adapter, withVisitor(stored, adopted), adopted.id);
        cachedVisitor = adopted;
        pendingSeed = null;
      }
      return { visitorId, sessionId: stored.session_id, sessionNumber: stored.session_number };
    },

    clear(): void {
      cachedVisitor = null;
      pendingSeed = null;
      adapter.delete(SESSION_STATE_KEY);
      adapter.delete(VISITOR_ID_FALLBACK_KEY);
      adapter.delete(SESSION_ID_FALLBACK_KEY);
    },
  };
}
