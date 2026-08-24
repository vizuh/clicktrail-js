/**
 * @vizuh/clicktrail-core — deterministic attribution engine.
 *
 * Pure by contract: no clock, no randomness without injection, no DOM,
 * no network. Same inputs always produce the same outputs.
 */
export * from './core/index.js';
export * from './conventions/stable.js';
export * from './conventions/incubating.js';

export {
  CANONICAL_EVENT_NAMES,
  EXTENSION_EVENT_NAMES,
  LEGACY_EVENT_NAME_MAP,
  CANONICAL_EVENT_FIELDS,
} from './canonical-events.js';
export type {
  CanonicalEventName,
  KnownEventName,
  CanonicalEventField,
} from './canonical-events.js';
export { toCanonicalEventName, isCanonicalEventName } from './canonical-events.js';
export { mintEventId, deriveStableEventId } from './ids.js';
export type { RandomBytesFn } from './ids.js';
export { classifyDeliveryStatus, classifyNetworkError } from './retry.js';
export type { DeliveryOutcome } from './retry.js';
