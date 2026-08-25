/**
 * Cookie-backed consent state for the browser boot module.
 *
 * Mirrors the handle's server-side contract: the decision lives in the
 * `ct_consent` cookie so SSR and client agree without hydration drift.
 * All document access goes through an injectable CookieJar seam; unit tests
 * run in plain node.
 */
import type { CookieJar } from '@vizuh/clicktrail/browser';
import { CONSENT_COOKIE } from './cookies.js';

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

export function tryDefaultEventTarget(): ConsentEventTargetLike | undefined {
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
