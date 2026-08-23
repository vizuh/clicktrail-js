/**
 * Visitor + session identity (Phase 2).
 *
 * Contract (portable prompt, "Identity and session rules"):
 * - stable visitor identity, maintained separately from attribution
 * - session identity is browser-owned: session_id always originates here,
 *   never derived from a server-side cookie
 * - 30-minute inactivity timeout rolls a new session
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
 * PURE: should inactivity roll a new session?
 *
 * Rules:
 * - no prior activity (`lastEventTs === null`) => roll (fresh session)
 * - elapsed >= timeoutMs            => roll (inactivity timeout reached;
 *                                      the boundary instant rolls)
 * - clock skew (now < lastEventTs)  => do NOT roll; the visitor is active
 */
export function rollSession(input: {
  lastEventTs: number | null;
  now: number;
  timeoutMs: number;
}): boolean {
  const { lastEventTs, now, timeoutMs } = input;
  if (lastEventTs === null) return true;
  if (now < lastEventTs) return false;
  return now - lastEventTs >= timeoutMs;
}

/** Structured session state persisted under `ct_session`. */
export interface StoredSessionState {
  session_id: string;
  session_number: number;
  /** Last observed activity in ms since epoch. */
  last_event_ts: number;
}

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
}

export interface IdentityStore {
  /**
   * Load-or-roll current identity and refresh the stored snapshot.
   * Rolls when there is no stored state or the inactivity timeout elapsed;
   * otherwise keeps session_id/session_number and only advances activity.
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
    if (typeof sessionId !== 'string' || sessionId === '') return null;
    if (typeof sessionNumber !== 'number' || !Number.isInteger(sessionNumber)) return null;
    if (typeof lastEventTs !== 'number') return null;
    return { session_id: sessionId, session_number: sessionNumber, last_event_ts: lastEventTs };
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
 * Browser-owned identity store over one adapter. The visitor_id survives
 * session rolls and even mirror expiry via the lightweight `ct_visitor_id`
 * fallback (DATA-MODEL.md:233/:245); it is regenerated only when both are
 * gone. Identifiers exist only after first use and vanish on clear()
 * (consent denial), per DATA-MODEL.md:246.
 */
export function createIdentityStore(config: IdentityStoreConfig): IdentityStore {
  const adapter = config.adapter;
  const randomBytes = config.randomBytes;
  const nowMs = config.nowMs;
  const timeoutMs = config.timeoutMs ?? SESSION_TIMEOUT_MS;

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
      const stored = readStoredSession(adapter);
      const visitorId = resolveVisitorId(stored);
      if (stored === null || rollSession({ lastEventTs: stored.last_event_ts, now, timeoutMs })) {
        const next: StoredSessionState = {
          session_id: generateId(randomBytes),
          session_number: (stored?.session_number ?? 0) + 1,
          last_event_ts: now,
        };
        persist(adapter, next, visitorId);
        return { visitorId, sessionId: next.session_id, sessionNumber: next.session_number };
      }
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
