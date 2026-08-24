/**
 * @vizuh/clicktrail-nuxt client plugin runtime entry.
 *
 * Registered by the module via `addPlugin({ mode: 'client' })` (through the
 * thin ./plugins/client.ts wrapper). Reads runtimeConfig from nuxtApp's
 * payload structurally — no `nuxt`/`vue` imports, so the package builds
 * and tests without Nuxt installed. The isBrowserEnvironment() guard keeps
 * SSR renders side-effect free.
 */
import { bootClickTrailClient, isBrowserEnvironment } from '../client.js';
import type { ClientBootSeams } from '../client.js';
import { createClicktrailComposable, peekActiveClicktrail, setActiveClicktrail } from '../composable.js';
import { defaultConsentCookieJar, defaultConsentEventTarget } from '../consent.js';
import type {
  ClickTrailPublicRuntimeConfig,
  NuxtAppLike,
  NuxtPluginObjectLike,
} from '../types.js';
import type { RouteLocationLike, RouteTrackingSeam } from '../route-tracking.js';

/** Debugging handle: the booted SDK instance on globalThis. */
export const NUXT_GLOBAL_KEY = '__CLICKTRAIL_NUXT__';

interface VueRouterLike {
  afterEach: (cb: (to: RouteLocationLike, from: RouteLocationLike) => void) => (() => void) | void;
}

function routerSeamFrom(nuxtApp: NuxtAppLike): RouteTrackingSeam | undefined {
  const router = nuxtApp.$router as VueRouterLike | undefined;
  if (!router || typeof router.afterEach !== 'function') return undefined;
  const doc = (globalThis as { document?: Document }).document;
  const loc = doc?.location as (URL & Location) | undefined;
  if (!loc) return undefined;
  return {
    href: () => loc.href,
    referrer: () => (typeof doc!.referrer === 'string' ? doc!.referrer : ''),
    host: () => loc.host,
    afterEach: (handler) => {
      const off = router.afterEach(handler);
      return () => {
        off?.();
      };
    },
  };
}

function readClientConfig(nuxtApp: NuxtAppLike): ClickTrailPublicRuntimeConfig | null {
  const publicCfg = nuxtApp.payload?.config?.public;
  const cfg = publicCfg?.['clicktrail'];
  if (!cfg || typeof cfg !== 'object') return null;
  return cfg as ClickTrailPublicRuntimeConfig;
}

const plugin: NuxtPluginObjectLike = {
  name: 'clicktrail:client',
  setup(nuxtApp: NuxtAppLike): void {
    // SSR guard: never touch browser seams during server render.
    if (!isBrowserEnvironment()) return;

    const config = readClientConfig(nuxtApp);
    if (!config) return; // module not configured; stay inert.

    const seams: ClientBootSeams = {
      cookieJar: defaultConsentCookieJar(),
      eventTarget: defaultConsentEventTarget(),
    };
    const routerSeam = routerSeamFrom(nuxtApp);
    if (routerSeam) seams.routerSeam = routerSeam;

    const booted = bootClickTrailClient(config, seams);
    setActiveClicktrail(createClicktrailComposable(booted.instance, seams.cookieJar));
    (globalThis as unknown as Record<string, unknown>)[NUXT_GLOBAL_KEY] = booted.instance;
    nuxtApp.provide?.('clicktrail', peekActiveClicktrail());
  },
};

export default plugin;
