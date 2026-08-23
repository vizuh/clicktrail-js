/**
 * First-party storage adapters (Phase 2).
 *
 * Contract (TRACKING-ATTRIBUTION-PORTABLE-PROMPT.md, "Storage rules"):
 * - attribution lives in a first-party, server-readable store (cookie)
 * - a client-side mirror carries explicit expiry metadata tied to the
 *   retention setting
 * - legacy local copies WITHOUT expiry metadata are discarded instead of
 *   being revived indefinitely
 * - consent denial clears ALL attribution storage
 *
 * All host effects enter as injected seams: a cookie jar for cookies, a
 * Storage-like object for the mirror, an injected clock for expiry. The
 * default jar/storage lookups are guarded so this module is import-safe
 * in SSR (no side effects until used).
 */

/** Milliseconds per day — retention arithmetic only. */
export const DAY_MS = 86_400_000;

/** Minimal synchronous key/value seam every store implements. */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/**
 * Canonical storage key names (click-trail-handler DATA-MODEL.md).
 * Line citations refer to docs/architecture/DATA-MODEL.md at v1.9.0.
 */
export const ATTRIBUTION_KEY = 'attribution'; // DATA-MODEL.md:230
export const LEGACY_ATTRIBUTION_KEY = 'ct_attribution'; // DATA-MODEL.md:114 (older installs)
export const SESSION_ID_FALLBACK_KEY = 'ct_session_id'; // DATA-MODEL.md:232, :238
export const VISITOR_ID_FALLBACK_KEY = 'ct_visitor_id'; // DATA-MODEL.md:233, :239
export const SESSION_STATE_KEY = 'ct_session'; // DATA-MODEL.md:234, :240

/** Every surface `clearAttributionStorage` must wipe on consent denial. */
export const ATTRIBUTION_STORAGE_KEYS: readonly string[] = [
  ATTRIBUTION_KEY,
  LEGACY_ATTRIBUTION_KEY,
  SESSION_ID_FALLBACK_KEY,
  VISITOR_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
];

/** Delete every known attribution/identity key from the given adapters. */
export function clearAttributionStorage(...adapters: readonly StorageAdapter[]): void {
  for (const adapter of adapters) {
    for (const key of ATTRIBUTION_STORAGE_KEYS) adapter.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Cookie storage (first-party, server-readable)
// ---------------------------------------------------------------------------

export type CookieSameSite = 'Strict' | 'Lax' | 'None';

/** Injectable cookie attributes; every field is optional. */
export interface CookieAttributes {
  path?: string;
  domain?: string;
  /** Max lifetime in seconds. Omit => session cookie. */
  maxAgeSeconds?: number;
  secure?: boolean;
  sameSite?: CookieSameSite;
}

/** Seam over the document cookie jar so tests never touch `document`. */
export interface CookieJar {
  /** Raw document.cookie contents. */
  read(): string;
  /** Write one full cookie string (`k=v; Path=/; ...`). */
  write(cookieString: string): void;
}

export interface CookieStorageConfig {
  /** Attributes injected into every written cookie. */
  attrs?: CookieAttributes;
  /** Cookie jar override (tests / non-DOM hosts). Default: document.cookie. */
  jar?: CookieJar;
}

function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  let out = `${name}=${encodeURIComponent(value)}`;
  if (attrs.path !== undefined) out += `; Path=${attrs.path}`;
  if (attrs.domain !== undefined) out += `; Domain=${attrs.domain}`;
  if (attrs.maxAgeSeconds !== undefined) out += `; Max-Age=${attrs.maxAgeSeconds}`;
  if (attrs.secure === true) out += '; Secure';
  if (attrs.sameSite !== undefined) out += `; SameSite=${attrs.sameSite}`;
  return out;
}

function parseCookies(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (raw === '') return map;
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      map.set(name, decodeURIComponent(value));
    } catch {
      // Malformed escape: keep the raw value rather than dropping the entry.
      map.set(name, value);
    }
  }
  return map;
}

/** Default jar over `document.cookie`; inert when `document` is absent. */
export function defaultCookieJar(): CookieJar {
  const doc = (): { cookie: string } | undefined =>
    (globalThis as { document?: { cookie: string } }).document;
  return {
    read: () => doc()?.cookie ?? '',
    write: (cookieString) => {
      const d = doc();
      if (d) d.cookie = cookieString;
    },
  };
}

/**
 * First-party cookie storage. Server-readable by construction; attribute
 * injection lets hosts match their consent/CMP posture (Secure, SameSite...).
 */
export function cookieStorage(config: CookieStorageConfig = {}): StorageAdapter {
  const attrs: CookieAttributes = config.attrs ?? {};
  const jar = config.jar ?? defaultCookieJar();
  return {
    get(key) {
      return parseCookies(jar.read()).get(key) ?? null;
    },
    set(key, value) {
      jar.write(serializeCookie(key, value, attrs));
    },
    delete(key) {
      // RFC 6265 deletion: expired session-scoped cookie on the same path.
      jar.write(
        serializeCookie(key, '', { ...attrs, maxAgeSeconds: 0 }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Mirror storage (localStorage with explicit expiry metadata)
// ---------------------------------------------------------------------------

/**
 * Envelope written around every mirrored value.
 * `v` gates legacy entries: anything without `v === 1` AND an explicit
 * `expires_at` field is a pre-metadata legacy copy and is discarded on read
 * (DATA-MODEL.md:121). `expires_at: null` means "retention not configured";
 * such entries never expire client-side.
 */
export interface MirrorEnvelope {
  v: 1;
  expires_at: number | null;
  data: string;
}

/** Minimal Storage-like seam (localStorage in the browser). */
export interface MirrorBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MirrorStorageConfig {
  /**
   * Retention days; mirror expiry = write time + retentionDays (portable
   * prompt: "tie client-side mirror expiry to the retention setting").
   * Omit => entries carry `expires_at: null`.
   */
  retentionDays?: number;
  /** Injected wall clock in ms. Required for expiry to be testable. */
  nowMs?: () => number;
  /** Backend override. Default: globalThis.localStorage when present. */
  backend?: MirrorBackend | null;
}

/** Default backend lookup; null when localStorage is unavailable (SSR). */
export function defaultMirrorBackend(): MirrorBackend | null {
  const ls = (globalThis as { localStorage?: MirrorBackend }).localStorage;
  return ls ?? null;
}

function parseEnvelope(raw: string): MirrorEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const env = parsed as Record<string, unknown>;
    if (env['v'] !== 1) return null;
    if (!('expires_at' in env)) return null;
    if (typeof env['data'] !== 'string') return null;
    const expiresAt = env['expires_at'];
    if (expiresAt !== null && typeof expiresAt !== 'number') return null;
    return { v: 1, expires_at: expiresAt, data: env['data'] };
  } catch {
    return null;
  }
}

/**
 * localStorage-backed mirror with TTL-bound expiry metadata. Reads are
 * schema-tolerant and destructive on failure: unparseable payloads,
 * envelopes missing expiry metadata (legacy copies), and expired entries
 * are deleted instead of revived. Quota/write failures are swallowed —
 * the mirror is resilience-only state behind the server-readable cookie.
 */
export function mirrorStorage(config: MirrorStorageConfig = {}): StorageAdapter {
  const backend = config.backend !== undefined ? config.backend : defaultMirrorBackend();
  const nowMs = config.nowMs ?? (() => Date.now());
  const ttlMs =
    config.retentionDays !== undefined ? config.retentionDays * DAY_MS : null;
  return {
    get(key) {
      if (!backend) return null;
      const raw = backend.getItem(key);
      if (raw === null) return null;
      const env = parseEnvelope(raw);
      if (env === null) {
        // Legacy copy without expiry metadata: discard, never revive.
        backend.removeItem(key);
        return null;
      }
      if (env.expires_at !== null && nowMs() >= env.expires_at) {
        backend.removeItem(key);
        return null;
      }
      return env.data;
    },
    set(key, value) {
      if (!backend) return;
      const env: MirrorEnvelope = {
        v: 1,
        expires_at: ttlMs === null ? null : nowMs() + ttlMs,
        data: value,
      };
      try {
        backend.setItem(key, JSON.stringify(env));
      } catch {
        // Quota / private-mode failures are non-fatal for a mirror.
      }
    },
    delete(key) {
      if (!backend) return;
      backend.removeItem(key);
    },
  };
}
