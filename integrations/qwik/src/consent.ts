/**
 * @vizuh/clicktrail-qwik/consent — consent state + cookie hub.
 *
 * Port of the `@vizuh/clicktrail-consent` package patterns (types, gates)
 * plus the Nuxt integration's cookie-backed hub: Qwik apps render on the
 * server, so the consent decision lives in a `ct_consent` cookie and SSR
 * middleware, route loaders, and browser code all read the same value
 * without hydration drift. A `clicktrail:consent` custom event notifies a
 * running client so deferred tracking starts immediately.
 *
 * Recording and respecting consent is NOT consent management: hosts own
 * the CMP decision; this module carries the state and enforces the gates.
 * All document access goes through injectable seams; unit tests run in
 * plain node with zero qwik imports.
 */
import type { CookieJar } from '@vizuh/clicktrail-browser';

// ---------------------------------------------------------------------------
// Types (port of packages/consent/src/types.ts)
// ---------------------------------------------------------------------------

/** Purpose flags an integration may gate on. Absent = unknown = denied. */
export interface ConsentPurposes {
  analytics?: boolean;
  advertising?: boolean;
  marketing?: boolean;
}

/** Where a consent decision came from (host CMP, cookie banner, API, ...). */
export type ConsentSource = string;

export interface ConsentRecord extends ConsentPurposes {
  /** 'granted' | 'denied' for the overall decision. */
  state: 'granted' | 'denied';
  source?: ConsentSource;
  /** Policy version the decision was made under (contract field). */
  policyVersion?: string;
  /** ISO-8601 timestamp of the decision; caller-owned clock. */
  at?: string;
}

export function isGranted(record: ConsentRecord | null | undefined): boolean {
  return record?.state === 'granted';
}

// ---------------------------------------------------------------------------
// Gates (port of packages/consent/src/gates.ts)
// ---------------------------------------------------------------------------

/** Consent snapshot provider — hosts wire this to their source of truth. */
export type ConsentSnapshot = () => ConsentRecord | null;

/** SDK consentGate shape: evaluated per capture attempt. */
export type ConsentGate = () => boolean;

export function createConsentGate(snapshot: ConsentSnapshot): ConsentGate {
  return () => isGranted(snapshot());
}

/** Gate for persistence: false blocks cookie/storage writes entirely. */
export function storageAllowed(snapshot: ConsentSnapshot): boolean {
  return isGranted(snapshot());
}

/** Gate for delivery: false drops events at the queue head. */
export function transmissionAllowed(
  snapshot: ConsentSnapshot,
  purpose: keyof ConsentPurposes = 'analytics',
): boolean {
  const record: ConsentRecord | null = snapshot();
  if (!record || !isGranted(record)) return false;
  return record[purpose] === true;
}

// ---------------------------------------------------------------------------
// Cookie hub (shared ct_consent contract across SSR and browser)
// ---------------------------------------------------------------------------

/** Cookie holding the consent decision ('granted' | 'denied'). */
export const CONSENT_COOKIE = 'ct_consent';

/** Custom event fired after every client-side consent write. */
export const CONSENT_EVENT = 'clicktrail:consent';

/** Consent cookie lifetime: 180 days. */
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** Event-target subset used for the consent event. */
export interface ConsentEventTargetLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  dispatchEvent?: (event: { type: string }) => void;
}

/**
 * Read the consent decision out of a raw `Cookie` request header.
 * Server-side twin of {@link readStoredConsent}; tolerates missing or
 * corrupt cookies (unknown = null).
 */
export function parseConsentFromCookieHeader(
  cookieHeader: string | null | undefined,
): boolean | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== CONSENT_COOKIE) continue;
    const value = pair.slice(eq + 1).trim();
    if (value === 'granted') return true;
    if (value === 'denied') return false;
    return null;
  }
  return null;
}

/** Read the stored consent decision ('granted' | 'denied' | null). */
export function readStoredConsent(jar: Pick<CookieJar, 'read'>): boolean | null {
  return parseConsentFromCookieHeader(jar.read());
}

/**
 * Build the Set-Cookie attribute string for the consent decision
 * (path-scoped so every route and the SSR middleware agree).
 */
export function consentSetCookie(granted: boolean): string {
  return `${CONSENT_COOKIE}=${granted ? 'granted' : 'denied'}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Write the consent cookie through a browser-side jar. */
export function writeConsentCookie(granted: boolean, jar: CookieJar): void {
  jar.write(consentSetCookie(granted));
}

function defaultConsentCookieJar(): CookieJar {
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

function tryDefaultEventTarget(): ConsentEventTargetLike | undefined {
  return (globalThis as unknown as { document?: ConsentEventTargetLike }).document;
}

export interface ConsentSeams {
  /** Cookie jar for the ct_consent cookie. Default: document.cookie. */
  cookieJar?: CookieJar;
  /** Event target receiving/raising the consent event. Default: document. */
  eventTarget?: ConsentEventTargetLike;
}

/**
 * Public consent setter. Writes the cookie and notifies a running client
 * so deferred tracking starts. Hosts call this from their CMP callback:
 *
 * ```ts
 * import { setConsent } from '@vizuh/clicktrail-qwik/consent';
 * setConsent(true);
 * ```
 */
export function setConsent(granted: boolean, seams: ConsentSeams = {}): void {
  writeConsentCookie(granted, seams.cookieJar ?? defaultConsentCookieJar());
  // Outside a browser there is nothing to notify; the cookie still lands.
  const target = seams.eventTarget ?? tryDefaultEventTarget();
  target?.dispatchEvent?.({ type: CONSENT_EVENT });
}
