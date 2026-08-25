/**
 * @vizuh/clicktrail-qwik/qwik-city — Qwik City server middleware.
 *
 * Captures the INITIAL attribution signal (UTMs, click IDs, external
 * referrer) on the first HTML request, before any JavaScript runs:
 *
 * - parses the landing URL through the deterministic core
 *   (`parseAttributionUrl`), merges it into the canonical flat payload
 *   (`mergeAttributionTouch`: ft_* write-once, lt_* refreshed)
 * - stores the result in a REQUEST-LOCAL store (Qwik City's sharedMap)
 *   so route loaders/actions can attach identity to conversions
 * - when (and only when) the consent cookie says 'granted', mirrors the
 *   payload into the first-party `attribution` cookie so later requests
 *   and the browser SDK keep first-touch history
 *
 * PERFORMANCE CONTRACT: this is NOT an inline analytics script dump. The
 * middleware is ordinary server code in the existing SSR pass — zero
 * client JS is added by capture, which is what preserves Qwik's
 * resumability advantage. Conversions should prefer SERVER-side senders
 * (`@vizuh/clicktrail-qwik/server`) reading the request-local store.
 *
 * STRUCTURAL SEAM: no `@builder.io/qwik-city` import. The middleware is a
 * plain `(requestEvent, next) => Promise<Response>` function structurally
 * compatible with Qwik City's `RequestHandler`. Integration point for a
 * real Qwik app (src/routes/layout.tsx or entry.prod):
 *
 * ```ts
 * import { createClickTrailMiddleware } from '@vizuh/clicktrail-qwik/qwik-city';
 * export const onRequest = createClickTrailMiddleware({ ... });
 * ```
 */
import { mergeAttributionTouch, parseAttributionUrl } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';
import {
  ATTRIBUTION_KEY,
  LEGACY_ATTRIBUTION_KEY,
  parseCookieMap,
} from '@vizuh/clicktrail-browser';
import type { ServerIdentity } from './server.js';
import { parseConsentFromCookieHeader, consentSetCookie, CONSENT_COOKIE } from './consent.js';

/** sharedMap key under which the captured identity lands per request. */
export const SHARED_MAP_KEY = '__clicktrail_attribution__';

/** Default attribution cookie lifetime: 180 days. */
const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Structural subset of Qwik City's RequestEvent used here. `url` accepts
 * string | URL; `cookie`/`sharedMap` mirror Qwik City's shapes exactly.
 */
export interface RequestEventLike {
  url: string | URL;
  headers: { get(name: string): string | null };
  cookie: {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options?: Record<string, unknown>): void;
  };
  /** Qwik City request-local store. Plain Map keeps tests dependency-free. */
  sharedMap: Map<string, unknown>;
}

/** Structural Next function: continue down the middleware chain. */
export type NextFn = () => Promise<unknown> | unknown;

/** Structural Qwik City middleware shape. */
export type QwikCityMiddleware = (
  requestEvent: RequestEventLike,
  next: NextFn,
) => Promise<unknown>;

export interface ClickTrailMiddlewareOptions {
  siteId?: string;
  workspaceId?: string;
  /**
   * When false, the attribution cookie is written regardless of the
   * ct_consent cookie (host has decided consent is not required). Default
   * true: persist only while the consent cookie reads 'granted'.
   */
  consentRequired?: boolean;
  /** Injected clock stamping attribution parses. */
  now?: () => string;
}

export interface CaptureResult {
  /** True when the landing URL carried an attribution signal. */
  captured: boolean;
  /** Why nothing was captured ('no_signal' | 'internal_referrer'). */
  reason?: 'no_signal' | 'internal_referrer';
  /** Consent decision observed on the request (null = absent). */
  consentState: boolean | null;
  /** Whether the merged payload was mirrored into the attribution cookie. */
  persistedToCookie: boolean;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read any stored attribution payload from the request cookies. */
export function readStoredAttribution(
  cookieHeader: string | null | undefined,
): AttributionPayload {
  if (!cookieHeader) return {};
  const cookies = parseCookieMap(cookieHeader);
  const raw = cookies[ATTRIBUTION_KEY] ?? cookies[LEGACY_ATTRIBUTION_KEY];
  if (typeof raw !== 'string' || raw === '') return {};
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: AttributionPayload = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * Capture initial attribution for one server request. Never throws into
 * host navigation handling; malformed input degrades to `captured: false`.
 * Identity always lands in the request-local store (in-memory only);
 * cookie persistence is gated on the consent cookie.
 */
export function captureInitialAttribution(
  event: RequestEventLike,
  options: ClickTrailMiddlewareOptions = {},
): CaptureResult {
  const now = options.now ?? (() => new Date().toISOString());
  const url = String(event.url);
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // Malformed URL: fall through with no host; parse will no-signal.
  }

  const consentRequired = options.consentRequired !== false;
  const consentState = parseConsentFromCookieHeader(event.headers.get('cookie'));

  const referrer = event.headers.get('referer');
  const result = parseAttributionUrl({
    url,
    ...(referrer ? { referrer } : {}),
    currentHost: host,
    now: now(),
  });

  const base: CaptureResult = {
    captured: false,
    consentState,
    persistedToCookie: false,
  };
  if (result.kind !== 'touch') {
    return { ...base, reason: result.reason };
  }

  // Request-local store FIRST: usable for conversions even pre-consent
  // (in-memory, dies with the request — nothing non-essential persists).
  const cookieHeader = event.headers.get('cookie');
  const merged = mergeAttributionTouch(readStoredAttribution(cookieHeader), result.touch);
  event.sharedMap.set(SHARED_MAP_KEY, merged);

  const persist =
    !consentRequired || consentState === true;
  if (persist) {
    event.cookie.set(ATTRIBUTION_KEY, encodeURIComponent(JSON.stringify(merged)), {
      path: '/',
      maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
      sameSite: 'Lax',
      httpOnly: false,
    });
  }

  return { captured: true, consentState, persistedToCookie: persist };
}

/**
 * Read the identity captured earlier in the same request out of Qwik
 * City's sharedMap. Route loaders/actions call this and hand the result
 * to `ClickTrailServer.trackLead/trackBooking/trackPurchase`.
 */
export function identityFromSharedMap(sharedMap: Map<string, unknown>): ServerIdentity | null {
  const raw = sharedMap.get(SHARED_MAP_KEY);
  if (!raw || typeof raw !== 'object') return null;
  return { payload: raw as AttributionPayload };
}

/**
 * Build the structural Qwik City middleware. Capture failures never break
 * navigation; `next()` always runs.
 */
export function createClickTrailMiddleware(
  options: ClickTrailMiddlewareOptions = {},
): QwikCityMiddleware {
  return async (requestEvent, next) => {
    try {
      captureInitialAttribution(requestEvent, options);
    } catch {
      // Deterministic no-op: analytics must never break page rendering.
    }
    return next();
  };
}
