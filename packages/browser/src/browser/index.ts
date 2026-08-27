/**
 * @vizuh/clicktrail/browser — thin browser layer.
 *
 * Effects live here (clock/network/dataLayer), built against the frozen
 * deterministic core. Import-safe in SSR environments: no side effects
 * until createClickTrail(...).start().
 */
export {
  buildEventPayload,
  buildMarketingTrailEnvelope,
  sanitizeServerEventInput,
} from './serialize.js';
export type {
  ClickTrailEvent,
  MarketingTrailContext,
  MarketingTrailEnvelope,
  StampedClickTrailEvent,
} from './serialize.js';
export { httpDestination, dataLayerDestination } from './transport.js';
export type {
  Destination,
  SendFn,
  HttpDestinationConfig,
  DataLayerDestinationConfig,
} from './transport.js';
export { createLegacyGlobal } from './global-adapter.js';
export type {
  LegacyGlobalApi,
  LegacyGlobalInstance,
  SessionSnapshot,
} from './global-adapter.js';
export {
  applyBrowserIdentifiers,
  collectBrowserIdsFromCookies,
  parseCookieMap,
  parseGaSessionDataValue,
} from './browser-ids.js';
export { createClickTrail } from './create-clicktrail.js';
export type {
  ClickTrailConfig,
  ClickTrailInstance,
  ClickTrailStorageConfig,
  DiagnosticsLevel,
} from './create-clicktrail.js';
export { generateId, rollSession, uuidV4FromBytes, SESSION_TIMEOUT_MS } from './identity.js';
export type {
  IdentitySnapshot,
  IdentityStore,
  IdentityStoreConfig,
  RandomBytesFn,
  StoredSessionState,
} from './identity.js';
export {
  loadAttributionPayload,
  saveAttributionPayload,
  normalizeLegacyAliases,
  filterCanonical,
  LEGACY_KEY_ALIASES,
  CANONICAL_PAYLOAD_KEYS,
  TOUCH_SUFFIXES,
} from './payload-store.js';
export {
  clearAttributionStorage,
  cookieStorage,
  mirrorStorage,
  ATTRIBUTION_KEY,
  ATTRIBUTION_STORAGE_KEYS,
  DAY_MS,
  LEGACY_ATTRIBUTION_KEY,
  SESSION_ID_FALLBACK_KEY,
  SESSION_STATE_KEY,
  VISITOR_ID_FALLBACK_KEY,
} from './storage.js';
export { JOURNEY_ID_KEY } from './storage.js';
export type {
  CookieAttributes,
  CookieJar,
  CookieSameSite,
  CookieStorageConfig,
  MirrorBackend,
  MirrorEnvelope,
  MirrorStorageConfig,
  StorageAdapter,
} from './storage.js';
