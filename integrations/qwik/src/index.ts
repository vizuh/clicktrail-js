/**
 * @vizuh/clicktrail-qwik — first-party attribution for Qwik + Qwik City.
 *
 * Umbrella re-export. Subpaths exist for tree-shaking-sensitive entries:
 * - `@vizuh/clicktrail-qwik/qwik-city` — server middleware (capture)
 * - `@vizuh/clicktrail-qwik/server`     — conversion senders
 * - `@vizuh/clicktrail-qwik/browser`    — on-demand client boot + dedupe
 * - `@vizuh/clicktrail-qwik/consent`    — shared consent state + gates
 *
 * Zero `@builder.io/qwik`, `@builder.io/qwik-city`, or `vite` imports:
 * every platform touchpoint is a structural seam documented in the module
 * headers, so this package builds, tests, and ships without Qwik itself.
 */
export {
  CONSENT_COOKIE,
  CONSENT_EVENT,
  ConsentEventTargetLike,
  ConsentPurposes,
  ConsentRecord,
  ConsentSeams,
  ConsentSnapshot,
  ConsentGate,
  ConsentSource,
  consentSetCookie,
  createConsentGate,
  isGranted,
  parseConsentFromCookieHeader,
  readStoredConsent,
  setConsent,
  storageAllowed,
  transmissionAllowed,
  writeConsentCookie,
} from './consent.js';
export {
  attachQwikNavigationTracking,
  bootClickTrailClient,
  createHistoryNavigationSeam,
  pageKeyOf,
  BootedClient,
  ClickTrailQwikClientConfig,
  ClientSeams,
  NavigationCallbackSeam,
  RouteTrackerOptions,
} from './browser.js';
export {
  captureInitialAttribution,
  createClickTrailMiddleware,
  identityFromSharedMap,
  readStoredAttribution,
  SHARED_MAP_KEY,
  CaptureResult,
  ClickTrailMiddlewareOptions,
  NextFn,
  QwikCityMiddleware,
  RequestEventLike,
} from './qwik-city-middleware.js';
export {
  ClickTrailServer,
  parseIdentityFromCookies,
  BookingData,
  ConversionInput,
  ClickTrailServerConfig,
  LeadData,
  PurchaseData,
  SendResult,
  ServerIdentity,
} from './server.js';
