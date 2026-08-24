/**
 * @vizuh/clicktrail/conversation — UNSTABLE entry point.
 * Journey-aware conversation tracking for Chatwoot-style surfaces.
 *
 * Effects live here (storage/clock/randomness defaults are lazy seams),
 * built against the frozen deterministic core. Import-safe in SSR: no side
 * effects until createConversationTracker(...) emits its first event.
 *
 * PRIVACY LAW: captureContent defaults to FALSE (metadata only); enabling
 * it requires a redact fn or construction throws.
 */
export {
  CHATWOOT_ATTRIBUTION_SUMMARY_KEYS,
  CHATWOOT_JOURNEY_ATTRIBUTE,
  buildChatwootAttributes,
} from './chatwoot.js';
export type { ChatwootAttributesInput } from './chatwoot.js';
export { JOURNEY_ID_KEY, createJourneyStore } from './journey-store.js';
export type { JourneyStore, JourneyStoreConfig } from './journey-store.js';
export { createConversationTracker } from './tracker.js';
export type {
  ConversationHost,
  ConversationTracker,
  ConversationTrackerConfig,
  JourneyActor,
  JourneyEventInput,
} from './tracker.js';
