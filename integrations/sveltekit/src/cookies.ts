/**
 * First-party cookie contract shared between the handle (server) and the
 * browser boot module.
 *
 * - `ct_attribution` carries the canonical flat attribution payload as JSON
 *   (Path=/, SameSite=Lax). The canonical `attribution` cookie name written
 *   by the browser SDK storage adapter is honored on READ for round-trip
 *   compatibility.
 * - `ct_consent` carries the consent decision ('granted' | 'denied'), so SSR
 *   and client agree without hydration drift.
 */
import { parseCookieMap } from '@vizuh/clicktrail/browser';
import type { AttributionPayload } from '@vizuh/clicktrail-core';

/** Cookie carrying the canonical flat attribution payload JSON. */
export const ATTRIBUTION_COOKIE = 'ct_attribution';

/** Cookie name written by the browser SDK; read as a fallback source. */
export const CANONICAL_ATTRIBUTION_COOKIE = 'attribution';

/** Cookie holding the consent decision ('granted' | 'denied'). */
export const CONSENT_COOKIE = 'ct_consent';

/** Attribution cookie lifetime: 180 days. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type ConsentDecision = boolean | null;

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Decode an attribution cookie value into a canonical payload. Tolerates
 * both URI-encoded and plain JSON forms; corrupt values yield {}.
 */
export function decodeAttributionPayload(raw: string | undefined | null): AttributionPayload {
  if (typeof raw !== 'string' || raw === '') return {};
  let candidate = raw;
  if (candidate.includes('%')) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      // Malformed escape: fall through with the raw value.
    }
  }
  const parsed = safeJsonParse(candidate);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: AttributionPayload = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Encode a payload for cookie storage (URI-encoded JSON keeps it header-safe). */
export function encodeAttributionPayload(payload: AttributionPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

/** Read the attribution identity from SvelteKit-style cookies. Best-effort. */
export function readAttributionCookie(cookies: { get(name: string): string | undefined }): AttributionPayload {
  const primary = cookies.get(ATTRIBUTION_COOKIE);
  if (primary) return decodeAttributionPayload(primary);
  return decodeAttributionPayload(cookies.get(CANONICAL_ATTRIBUTION_COOKIE));
}

/**
 * Read the consent decision from a raw Cookie header.
 * 'granted' -> true, 'denied' -> false, missing/corrupt -> null.
 */
export function readConsentFromHeader(cookieHeader: string | null | undefined): ConsentDecision {
  if (!cookieHeader) return null;
  const cookies = parseCookieMap(cookieHeader);
  const value = cookies[CONSENT_COOKIE];
  if (value === 'granted') return true;
  if (value === 'denied') return false;
  return null;
}

/** Read the consent decision from SvelteKit-style cookies. */
export function readConsentFromCookies(
  cookies: { get(name: string): string | undefined },
): ConsentDecision {
  const value = cookies.get(CONSENT_COOKIE);
  if (value === 'granted') return true;
  if (value === 'denied') return false;
  return null;
}
