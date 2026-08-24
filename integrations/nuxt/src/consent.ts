/**
 * Cookie-backed consent state shared between SSR and the client.
 *
 * Unlike the Astro integration (localStorage-backed), Nuxt renders on the
 * server, so the consent decision lives in a `ct_consent` cookie: SSR and
 * client agree without hydration drift. A `clicktrail:consent` custom
 * event still notifies a running client so deferred tracking starts (or
 * stops) immediately.
 *
 * All document access goes through an injectable CookieJar seam; unit
 * tests run in plain node.
 */
import type { CookieJar } from '@vizuh/clicktrail/browser';

/** Cookie holding the consent decision ('granted' | 'denied'). */
export const CONSENT_COOKIE = 'ct_consent';

/** Custom event fired after every consent write. */
export const CONSENT_EVENT = 'clicktrail:consent';

/** Consent cookie lifetime: 180 days. */
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** Event-target subset used for the consent event. */
export interface ConsentEventTargetLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  dispatchEvent?: (event: { type: string }) => void;
}

export interface ConsentSeams {
  /** Cookie jar for the ct_consent cookie. Default: document.cookie. */
  cookieJar?: CookieJar;
  /** Event target receiving/raising the consent event. Default: document. */
  eventTarget?: ConsentEventTargetLike;
}

export function defaultConsentCookieJar(): CookieJar {
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

export function defaultConsentEventTarget(): ConsentEventTargetLike {
  const d = (globalThis as unknown as { document?: ConsentEventTargetLike }).document;
  if (!d) {
    throw new Error('@vizuh/clicktrail-nuxt: the consent event target requires a browser environment.');
  }
  return d;
}

function tryDefaultEventTarget(): ConsentEventTargetLike | undefined {
  return (globalThis as unknown as { document?: ConsentEventTargetLike }).document;
}

/** Read the stored consent decision ('granted' | 'denied' | null). */
export function readStoredConsent(jar: CookieJar): boolean | null {
  for (const pair of jar.read().split(';')) {
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

/** Write the consent cookie (path-scoped so all routes agree). */
export function writeConsentCookie(granted: boolean, jar: CookieJar): void {
  jar.write(
    `${CONSENT_COOKIE}=${granted ? 'granted' : 'denied'}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax`,
  );
}

/**
 * Public consent setter. Writes the cookie and notifies a running client
 * so deferred tracking starts (or a started client stops). Hosts call:
 * `useClicktrail().setConsent(true)` from their CMP callback.
 */
export function setConsent(granted: boolean, seams: ConsentSeams = {}): void {
  writeConsentCookie(granted, seams.cookieJar ?? defaultConsentCookieJar());
  // Outside a browser there is nothing to notify; the cookie still lands.
  const target = seams.eventTarget ?? tryDefaultEventTarget();
  target?.dispatchEvent?.({ type: CONSENT_EVENT });
}
