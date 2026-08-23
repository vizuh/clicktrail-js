/**
 * Journey identity store (`/conversation`).
 *
 * A journey_id is a DURABLE cross-session identifier: unlike session_id it
 * survives session rolls and browser restarts. It persists under its own
 * storage key (`JOURNEY_ID_KEY` / `ct_journey_id`), is consent-gated like
 * every identity key, and is wiped on denial (the key is also part of
 * ATTRIBUTION_STORAGE_KEYS, so the main SDK's consent-denial wipe covers it
 * even when the host never touches this subpath).
 *
 * Determinism seams: randomness and the consent decision enter as injected
 * functions. No Date.now / Math.random / window / document access here.
 */
import { generateId } from '../browser/identity.js';
import type { RandomBytesFn } from '../browser/identity.js';
import { JOURNEY_ID_KEY } from '../browser/storage.js';
import type { StorageAdapter } from '../browser/storage.js';

export { JOURNEY_ID_KEY };

export interface JourneyStoreConfig {
  /** Adapter the journey id persists through (localStorage mirror default). */
  adapter: StorageAdapter;
  /** Injected random-byte source for UUID v4 journey-id generation. */
  randomBytes: RandomBytesFn;
  /**
   * Consent gate consulted before every read/write. Default: always
   * allowed. A denied gate wipes any stored journey id and yields ''.
   */
  allowed?: () => boolean;
}

export interface JourneyStore {
  /** Load-or-create the durable journey id. Empty string while denied. */
  current(): string;
  /** Remove the persisted journey id (consent denial / withdrawal). */
  clear(): void;
}

/** Load-or-create store over one adapter; mirrors createIdentityStore's shape. */
export function createJourneyStore(config: JourneyStoreConfig): JourneyStore {
  const adapter = config.adapter;
  const randomBytes = config.randomBytes;
  const allowed = config.allowed ?? (() => true);

  return {
    current(): string {
      if (!allowed()) {
        adapter.delete(JOURNEY_ID_KEY);
        return '';
      }
      const stored = adapter.get(JOURNEY_ID_KEY);
      if (stored !== null && stored !== '') return stored;
      const id = generateId(randomBytes);
      adapter.set(JOURNEY_ID_KEY, id);
      return id;
    },

    clear(): void {
      adapter.delete(JOURNEY_ID_KEY);
    },
  };
}
