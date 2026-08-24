/// <reference path="./runtime-config.d.ts" />
/**
 * @vizuh/clicktrail-nuxt — first-party attribution for Nuxt.
 *
 * Module factory + structural types at the root; server helpers, Nitro
 * utilities, composable, and consent state are also available from their
 * dedicated subpaths (`./server`, `./nitro`, `./composable`, `./plugin`).
 */
export { default, defineClicktrailModule } from './module.js';
export type { ClickTrailNuxtOptions } from './module.js';
export {
  CLIENT_PLUGIN_ENTRY,
  CONFIG_KEY,
  DEFAULT_ENDPOINT,
  DEFAULT_PROXY_PATTERN,
  MODULE_NAME,
  MODULE_VERSION,
  PROXY_HANDLER_ENTRY,
  defaultProxyConfig,
  validateProxyConfig,
} from './config.js';
export type { ClickTrailProxyConfig } from './config.js';
export {
  CONSENT_COOKIE,
  CONSENT_EVENT,
  defaultConsentCookieJar,
  readStoredConsent,
  setConsent,
  writeConsentCookie,
} from './consent.js';
export type { ConsentSeams } from './consent.js';
export { attachRouteTracking, pageKeyOf } from './route-tracking.js';
export type { RouteLocationLike, RouteTrackingSeam, RouteTrackerOptions } from './route-tracking.js';
export {
  createClicktrailComposable,
  peekActiveClicktrail,
  setActiveClicktrail,
  useClicktrail,
} from './composable.js';
export type { ClicktrailComposable } from './composable.js';
export {
  createEventHandler,
  parseIdentityFromCookies,
} from './nitro-utils.js';
export {
  ClickTrailServer,
} from './server.js';
export type {
  BookingData,
  ConversionInput,
  LeadData,
  PurchaseData,
  SendResult,
  ServerIdentity,
} from './server.js';
export type {
  ClickTrailPublicRuntimeConfig,
  ClickTrailServerRuntimeConfig,
  ClicktrailNuxtModule,
  NitroEventHandler,
  NuxtAppLike,
  NuxtContextLike,
  NuxtPluginObjectLike,
} from './types.js';
