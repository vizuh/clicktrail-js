/**
 * @vizuh/clicktrail-sveltekit/client — browser boot module.
 *
 * Boots the SDK with an HTTP destination over injected seams (cookie jar,
 * event target, afterNavigate-style navigation seam), wires URL-keyed
 * page-view dedupe across SvelteKit navigations, and defers start() while
 * consent is withheld. No side effects at import time; SSR-safe.
 */
import {
  createClickTrail,
  httpDestination,
} from '@vizuh/clicktrail/browser';
import type {
  ClickTrailConfig,
  ClickTrailInstance,
  CookieJar,
} from '@vizuh/clicktrail/browser';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';
import { attachNavigationTracking } from './navigation.js';
import type { NavigationSeam } from './navigation.js';
import type { ConsentEventTargetLike } from './consent-client.js';
import {
  readStoredConsent,
  writeConsentCookie,
  CONSENT_EVENT,
  tryDefaultEventTarget,
} from './consent-client.js';

/** Mirrors the shared options slice consumed by the browser boot. */
export interface ClientBootConfig {
  /** Event delivery endpoint. Default '/api/clicktrail'. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  consentRequired: boolean;
  trackPageViews: boolean;
  /** Log boot diagnostics to console. Default false. */
  debug: boolean;
}

export interface BrowserSeams {
  /** Cookie jar for the ct_consent cookie. Default: document.cookie. */
  cookieJar?: CookieJar;
  /** Event target receiving/raising the consent event. Default: document. */
  eventTarget?: ConsentEventTargetLike;
  /** Navigation seam. Default: history/popstate fallback. */
  navigationSeam?: NavigationSeam;
}

export interface BootedClient {
  instance: ClickTrailInstance;
  /** Resolves when the instance has started (immediately without gating). */
  whenStarted(): Promise<ClickTrailInstance>;
  detachNavigation(): void;
  /** Stop this client and detach navigation plus consent listeners. */
  dispose(): void;
  /** Merge canonical flat identity fields (e.g. contact_id) into the payload. */
  identify(fields: Record<string, string>): void;
  /** Track an event by any historical or free-form name (translated to canonical). */
  track(eventName: string, data?: Record<string, unknown>): void;
  /**
   * Track a conversion outcome. Money contract mirrors the server package:
   * value must be a positive finite number and requires a non-empty ISO-4217
   * currency; id fields must be non-empty strings. Throws TypeError on
   * invalid input.
   */
  conversion(input: ConversionInput): void;
}

export interface ConversionInput {
  /** Canonical or legacy event name ('sale', 'lead', 'booking', ...). */
  event?: string;
  leadId?: string;
  orderId?: string;
  bookingId?: string;
  value?: number;
  currency?: string;
}

function defaultCookieJar(): CookieJar {
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

export function defaultNavigationSeam(): NavigationSeam {
  const w = globalThis as unknown as {
    location?: Location;
    document?: Document;
    history?: History;
    addEventListener?: typeof window.addEventListener;
    removeEventListener?: typeof window.removeEventListener;
  };
  const loc = (): Location => {
    if (!w.location) throw new Error('clicktrail client: navigation seam requires a browser environment.');
    return w.location;
  };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const cb of listeners) cb();
  };
  let patchedPush: ((data: unknown, unused: string, url?: string | URL | null) => void) | null = null;
  let originalPush: History['pushState'] | null = null;

  return {
    href: () => loc().href,
    referrer: () => (typeof w.document?.referrer === 'string' ? w.document.referrer : ''),
    host: () => loc().host,
    afterNavigate(callback) {
      listeners.add(callback);
      if (listeners.size === 1) {
        if (w.history) {
          originalPush = w.history.pushState;
          patchedPush = (...args: Parameters<History['pushState']>) => {
            originalPush?.apply(w.history, args);
            notify();
          };
          w.history.pushState = patchedPush as History['pushState'];
        }
        w.addEventListener?.('popstate', notify);
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(callback);
        if (listeners.size !== 0) return;
        w.removeEventListener?.('popstate', notify);
        if (w.history && patchedPush && originalPush && w.history.pushState === patchedPush) {
          w.history.pushState = originalPush;
        }
        patchedPush = null;
        originalPush = null;
      };
    },
  };
}

function resolveSeams(seams: BrowserSeams): Required<BrowserSeams> {
  const eventTarget = seams.eventTarget ?? tryDefaultEventTarget();
  if (!eventTarget) {
    throw new Error('clicktrail client: bootClickTrailClient requires a browser environment.');
  }
  return {
    cookieJar: seams.cookieJar ?? defaultCookieJar(),
    eventTarget,
    navigationSeam: seams.navigationSeam ?? defaultNavigationSeam(),
  };
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`clicktrail client: ${field} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`clicktrail client: ${field} must be a positive finite number.`);
  }
  return value;
}

/**
 * Boot the ClickTrail client. Nothing persists before start(): page-view
 * touches merge in memory pre-start and are flushed by start() once consent
 * allows.
 */
export function bootClickTrailClient(
  config: ClientBootConfig,
  seams: BrowserSeams = {},
): BootedClient {
  const resolved = resolveSeams(seams);

  const destinations: ClickTrailConfig['destinations'] = [
    httpDestination({ endpoint: config.endpoint }),
  ];

  const instance = createClickTrail({
    destinations,
    ...(config.siteId !== undefined ? { siteId: config.siteId } : {}),
    ...(config.workspaceId !== undefined ? { workspaceId: config.workspaceId } : {}),
    consentGate: () => !config.consentRequired || readStoredConsent(resolved.cookieJar) === true,
    storage: {},
  });

  const detachNavigation =
    config.trackPageViews !== false
      ? attachNavigationTracking(instance, resolved.navigationSeam)
      : attachTouchOnlyTracking(instance, resolved.navigationSeam);

  let started = false;
  let resolveStart!: () => void;
  const whenStarted = new Promise<ClickTrailInstance>((resolve) => {
    resolveStart = () => {
      started = true;
      resolve(instance);
    };
  });

  const startNow = (): void => {
    if (!instance.isStarted()) instance.start();
    resolveStart();
  };

  let detachConsent = (): void => {};
  if (config.consentRequired) {
    const handleConsent = (): void => {
      const state = readStoredConsent(resolved.cookieJar);
      if (state === true) startNow();
      else if (state === false) {
        instance.clearData();
        if (instance.isStarted()) instance.stop();
      }
    };
    resolved.eventTarget.addEventListener(CONSENT_EVENT, handleConsent);
    detachConsent = () => resolved.eventTarget.removeEventListener(CONSENT_EVENT, handleConsent);
    if (readStoredConsent(resolved.cookieJar) === true) startNow();
  } else {
    startNow();
  }

  if (config.debug && typeof console !== 'undefined') {
    console.info(`[clicktrail] endpoint=${config.endpoint} started=${started}`);
  }

  return {
    instance,
    whenStarted: () => whenStarted,
    detachNavigation,
    dispose(): void {
      detachConsent();
      detachNavigation();
      if (instance.isStarted()) instance.stop();
    },

    identify(fields: Record<string, string>): void {
      // hydrateStoredPayload adopts canonical non-empty keys only, which is
      // exactly the identify contract (contact_id, lead ids, ...).
      instance.hydrateStoredPayload(fields);
    },

    track(eventName: string, data?: Record<string, unknown>): void {
      instance.track(toCanonicalEventName(eventName), data);
    },

    conversion(input: ConversionInput): void {
      const eventName = toCanonicalEventName(input.event ?? 'sale');
      if (
        input.value !== undefined &&
        (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value <= 0)
      ) {
        throw new TypeError('clicktrail client: conversion.value must be a positive finite number.');
      }
      if (input.value !== undefined) {
        requireNonEmptyString(input.currency, 'conversion.currency');
      }
      if (input.leadId !== undefined) requireNonEmptyString(input.leadId, 'conversion.leadId');
      if (input.orderId !== undefined) requireNonEmptyString(input.orderId, 'conversion.orderId');
      if (input.bookingId !== undefined) requireNonEmptyString(input.bookingId, 'conversion.bookingId');
      instance.track(eventName, {
        ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}),
        ...(input.orderId !== undefined ? { order_id: input.orderId } : {}),
        ...(input.bookingId !== undefined ? { booking_id: input.bookingId } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      });
    },
  };
}

function attachTouchOnlyTracking(instance: Pick<ClickTrailInstance, 'track' | 'mergeParsedTouch'>, seam: NavigationSeam): () => void {
  return attachNavigationTracking(instance, seam, { trackPageViews: false });
}

/** Convenience: write the consent decision and notify a running client. */
export function setClientConsent(granted: boolean, seams: BrowserSeams = {}): void {
  const jar = seams.cookieJar ?? defaultCookieJar();
  writeConsentCookie(granted, jar);
  const target = seams.eventTarget ?? tryDefaultEventTarget();
  target?.dispatchEvent?.({ type: CONSENT_EVENT });
}
