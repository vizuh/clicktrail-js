/**
 * Client boot core for the Nuxt plugin.
 *
 * SSR-SAFE by construction: every window/document/localStorage access is
 * routed through injected seams (cookie jar, event target, router seam),
 * so unit tests run in plain node. The plugin entry
 * (`src/runtime/plugin.client.ts`) reads runtimeConfig and calls this with
 * default browser seams; no side effects happen at import time.
 */
import {
  createClickTrail,
  httpDestination,
} from '@vizuh/clicktrail/browser';
import type { ClickTrailConfig, ClickTrailInstance } from '@vizuh/clicktrail/browser';
import type { CookieJar } from '@vizuh/clicktrail/browser';
import { attachRouteTracking } from './route-tracking.js';
import type { RouteTrackingSeam, RouteLocationLike } from './route-tracking.js';
import {
  CONSENT_EVENT,
  defaultConsentCookieJar,
  readStoredConsent,
} from './consent.js';
import type { ConsentEventTargetLike } from './consent.js';

/** Mirrors the public runtime-config slice the module writes. */
export interface ClientBootConfig {
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  consentRequired: boolean;
  trackPageViews: boolean;
  captureClickIds: boolean;
  debug: boolean;
}

export interface ClientBootSeams {
  /** Cookie jar for the consent cookie. Default: document.cookie. */
  cookieJar?: CookieJar;
  /** Event target for consent events. Default: document. */
  eventTarget?: ConsentEventTargetLike;
  /** Router seam for route-change tracking. Default: popstate fallback. */
  routerSeam?: RouteTrackingSeam;
}

export interface BootedClient {
  instance: ClickTrailInstance;
  /** Resolves when the instance has started (immediately without gating). */
  whenStarted(): Promise<ClickTrailInstance>;
  detachRouteTracking(): void;
}

function globalDoc(): Document | undefined {
  return (globalThis as { document?: Document }).document;
}

/** True when a real DOM location exists — the SSR/client seam check. */
export function isBrowserEnvironment(): boolean {
  return typeof globalDoc()?.location !== 'undefined';
}

interface MinimalLocation {
  href: string;
  host: string;
}

function defaultRouterSeam(): RouteTrackingSeam {
  const doc = globalDoc();
  if (!doc?.location) {
    throw new Error('@clicktrail/nuxt: client boot requires a browser environment.');
  }
  const loc = doc.location as unknown as MinimalLocation & {
    referrer?: string;
  };
  const win = globalThis as unknown as {
    addEventListener: (type: string, handler: () => void) => void;
    removeEventListener: (type: string, handler: () => void) => void;
  };
  return {
    href: () => loc.href,
    referrer: () => (typeof doc.referrer === 'string' ? doc.referrer : ''),
    host: () => loc.host,
    afterEach: (handler: (to: RouteLocationLike, from: RouteLocationLike) => void) => {
      const h = (): void => handler({}, {});
      win.addEventListener('popstate', h);
      return () => win.removeEventListener('popstate', h);
    },
  };
}

function resolveSeams(seams: ClientBootSeams): Required<ClientBootSeams> {
  const eventTarget =
    seams.eventTarget ?? (globalDoc() as unknown as ConsentEventTargetLike | undefined);
  if (!eventTarget || typeof eventTarget.addEventListener !== 'function') {
    throw new Error('@clicktrail/nuxt: client boot requires a browser environment.');
  }
  return {
    cookieJar: seams.cookieJar ?? defaultConsentCookieJar(),
    eventTarget,
    routerSeam: seams.routerSeam ?? defaultRouterSeam(),
  };
}

export function bootClickTrailClient(
  config: ClientBootConfig,
  seams: ClientBootSeams = {},
): BootedClient {
  const resolved = resolveSeams(seams);
  const destinations: ClickTrailConfig['destinations'] = [
    httpDestination({ endpoint: config.endpoint }),
  ];

  const instance = createClickTrail({
    destinations,
    ...(config.siteId !== undefined ? { siteId: config.siteId } : {}),
    ...(config.workspaceId !== undefined ? { workspaceId: config.workspaceId } : {}),
    storage: {},
  });

  let detachRouteTracking: () => void = () => {};
  if (config.trackPageViews !== false) {
    detachRouteTracking = attachRouteTracking(instance, resolved.routerSeam, {
      ...(config.captureClickIds === false ? { captureClickIds: false } : {}),
    });
  }

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

  if (config.consentRequired) {
    const granted = readStoredConsent(resolved.cookieJar);
    if (granted === true) {
      startNow();
    } else {
      resolved.eventTarget.addEventListener(CONSENT_EVENT, () => {
        const state = readStoredConsent(resolved.cookieJar);
        if (state === true) startNow();
        else if (state === false && instance.isStarted()) instance.stop();
      });
    }
  } else {
    startNow();
  }

  if (config.debug && typeof console !== 'undefined') {
    console.info(
      `[clicktrail] endpoint=${config.endpoint} started=${started}`,
    );
  }

  return { instance, whenStarted: () => whenStarted, detachRouteTracking };
}
