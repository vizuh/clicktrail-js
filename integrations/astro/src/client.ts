/**
 * @vizuh/clicktrail-astro/client — browser boot module.
 *
 * Injected as a `page` pattern script by the integration. Reads its
 * compile-time config from the Vite define global, boots the SDK with an
 * HTTP destination, wires view-transition page views, and defers start()
 * while consent is withheld.
 *
 * The testable core lives in `bootClickTrailClient` with injected DOM
 * seams; this module only reads globals and calls it. No side effects at
 * import time.
 */
import {
  createClickTrail,
  httpDestination,
} from '@vizuh/clicktrail/browser';
import type { ClickTrailConfig, ClickTrailInstance } from '@vizuh/clicktrail/browser';
import type { NavigationSeam } from './page-views.js';
import { attachPageViewTracking } from './page-views.js';
import { CLIENT_CONFIG_GLOBAL } from './config.js';
import type { ClickTrailClientConfig } from './config.js';

/** Compile-time constant replaced by the integration via Vite define. */
declare const __CLICKTRAIL_CLIENT_CONFIG__: string;

export const CONSENT_STORAGE_KEY = 'clicktrail-consent';
export const CONSENT_EVENT = 'clicktrail:consent';

export interface ClientDomSeams {
  /** localStorage-like for the consent flag. Default: window.localStorage. */
  storageLike?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Event target for consent + astro navigation events. */
  eventTarget?: {
    addEventListener: (type: string, handler: () => void) => void;
    removeEventListener: (type: string, handler: () => void) => void;
    dispatchEvent?: (event: { type: string }) => void;
  };
  navigationSeam?: NavigationSeam;
}

function defaultSeams(): Required<ClientDomSeams> & { navigationSeam: NavigationSeam } {
  const w = globalThis as unknown as {
    localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
    document?: {
      addEventListener: (type: string, h: () => void) => void;
      removeEventListener: (type: string, h: () => void) => void;
      dispatchEvent: (ev: unknown) => void;
      referrer?: string;
      location?: Location;
    };
  };
  if (!w.localStorage || !w.document?.location) {
    throw new Error('clicktrail client: bootClickTrailClient requires a browser environment.');
  }
  const doc = w.document;
  return {
    storageLike: w.localStorage,
    eventTarget: doc,
    navigationSeam: {
      href: () => doc.location!.href,
      referrer: () => (typeof doc.referrer === 'string' ? doc.referrer : ''),
      host: () => doc.location!.host,
    },
  };
}

/** Read the stored consent decision ('granted' | 'denied' | null). */
export function readStoredConsent(storageLike: Pick<Storage, 'getItem'>): boolean | null {
  const raw = storageLike.getItem(CONSENT_STORAGE_KEY);
  if (raw === 'granted') return true;
  if (raw === 'denied') return false;
  return null;
}

/**
 * Public consent setter. Writes the flag and notifies a running client so
 * deferred tracking starts immediately. Hosts call:
 * `globalThis.__clicktrailSetConsent(true)` from their CMP callback.
 */
export function setConsent(granted: boolean, seams: ClientDomSeams = {}): void {
  const resolved = resolveSeams(seams);
  resolved.storageLike.setItem(CONSENT_STORAGE_KEY, granted ? 'granted' : 'denied');
  resolved.eventTarget.dispatchEvent?.({ type: CONSENT_EVENT });
}

export interface BootedClient {
  instance: ClickTrailInstance;
  /** Resolves when the instance has started (immediately without consent gating). */
  whenStarted(): Promise<ClickTrailInstance>;
  detachPageViews(): void;
}

function resolveSeams(seams: ClientDomSeams): Required<ClientDomSeams> {
  if (seams.storageLike && seams.eventTarget && seams.navigationSeam) {
    return seams as Required<ClientDomSeams>;
  }
  return { ...defaultSeams(), ...seams } as Required<ClientDomSeams>;
}

export function bootClickTrailClient(
  config: ClickTrailClientConfig,
  seams: ClientDomSeams = {},
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

  // Touches merge in memory pre-start; nothing persists before consent.
  const detachPageViews = attachPageViewTracking(instance, resolved.navigationSeam, resolved.eventTarget.addEventListener, resolved.eventTarget.removeEventListener);

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
    const handleConsent = (): void => {
      const state = readStoredConsent(resolved.storageLike);
      if (state === true) startNow();
      else if (state === false) {
        instance.clearData();
        if (instance.isStarted()) instance.stop();
      }
    };
    resolved.eventTarget.addEventListener(CONSENT_EVENT, handleConsent);
    if (readStoredConsent(resolved.storageLike) === true) startNow();
  } else {
    startNow();
  }

  if (config.debug && typeof console !== 'undefined') {
    console.info(`[clicktrail] endpoint=${config.endpoint} started=${started}`);
  }

  return { instance, whenStarted: () => whenStarted, detachPageViews };
}

/** Entry point invoked by the injected page script. */
export function bootFromDefineGlobal(seams: ClientDomSeams = {}): BootedClient {
  const raw = (globalThis as unknown as Record<string, string | undefined>)[CLIENT_CONFIG_GLOBAL];
  if (!raw) {
    throw new Error('clicktrail client: missing __CLICKTRAIL_CLIENT_CONFIG__ define global.');
  }
  return bootClickTrailClient(JSON.parse(raw) as ClickTrailClientConfig, seams);
}
