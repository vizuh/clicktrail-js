/**
 * @clicktrail/sveltekit — first-party attribution and conversion tracking
 * for SvelteKit.
 */
import { clicktrail } from './handle.js';

export type {
  HandleLike,
  HandleInputLike,
  RequestEventLike,
  CookiesLike,
  CookieSerializeOptionsLike,
  MaybePromise,
} from './types.js';
export type { ClickTrailSvelteKitOptions, ClickTrailProxyConfig } from './config.js';
export {
  DEFAULT_ENDPOINT,
  DEFAULT_PROXY_PATTERN,
  defaultProxyConfig,
  validateProxyConfig,
} from './config.js';
export {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  CANONICAL_ATTRIBUTION_COOKIE,
  CONSENT_COOKIE,
  decodeAttributionPayload,
  encodeAttributionPayload,
  readAttributionCookie,
  readConsentFromCookies,
  readConsentFromHeader,
} from './cookies.js';
export { captureLandingAttribution } from './attribution.js';
export type { LandingCaptureInput, LandingCaptureResult } from './attribution.js';
export { createProxyHandler, dispatchProxyRequest } from './proxy.js';
export type { ProxyHandler } from './proxy.js';
export { attachNavigationTracking, pageKeyOf } from './navigation.js';
export type { NavigationSeam, NavigationTrackerOptions } from './navigation.js';
export { bootClickTrailClient, setClientConsent } from './client.js';
export { CONSENT_EVENT } from './consent-client.js';
export type {
  BootedClient,
  BrowserSeams,
  ClientBootConfig,
  ConversionInput as ClientConversionInput,
} from './client.js';
export { readStoredConsent, writeConsentCookie } from './consent-client.js';
export {
  parseIdentityFromCookies,
  trackConversion,
} from './server-events.js';
export type {
  ServerIdentity,
  TrackConversionOptions,
  SendResult,
  ConversionRequestLike,
} from './server-events.js';

export { clicktrail };
export default clicktrail;
