/**
 * window.ClickTrail-compatible legacy global API.
 *
 * PURE factory: takes the instance, returns the adapter object. The PAGE
 * assigns it to `window` (e.g. `window.ClickTrail = createLegacyGlobal(ct)`);
 * this module never touches `window` itself.
 */
import type { AttributionPayload } from '../core/types.js';

/** Session snapshot derived from the stored payload. */
export interface SessionSnapshot {
  visitorId: string;
  sessionId: string;
  sessionNumber: string;
}

/** Minimal structural contract the adapter needs from an instance. */
export interface LegacyGlobalInstance {
  getData(): AttributionPayload;
  getField(key: string): string;
  clearData(): void;
  getSession(): SessionSnapshot;
}

export interface LegacyGlobalApi {
  /** Full canonical flat payload (a defensive copy). */
  getData(): AttributionPayload;
  /** One field by canonical flat key (`ft_source`, `gclid`, ...). */
  getField(key: string): string;
  /** Reset all stored attribution state. */
  clearData(): void;
  /** Visitor/session identifiers known so far (Phase 2 fills these). */
  getSession(): SessionSnapshot;
}

export function createLegacyGlobal(instance: LegacyGlobalInstance): LegacyGlobalApi {
  return {
    getData: () => instance.getData(),
    getField: (key: string) => instance.getField(key),
    clearData: () => instance.clearData(),
    getSession: () => instance.getSession(),
  };
}
