/**
 * Shared seams for CMP adapters. Nothing here touches the DOM at import time;
 * adapters receive the window-like target when they are connected.
 */
import type { ConsentHub } from '../listener.js';
import type { ConsentRecord } from '../types.js';

/** Minimal window/document surface the adapters need (injectable for tests). */
export interface CmpTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  [key: string]: unknown;
}

export interface CmpAdapterOptions {
  /** Window-like object; defaults to globalThis.window when present. */
  target?: CmpTarget;
  /** Clock seam for the record's `at` field. */
  now?: () => Date;
}

export type Disposer = () => void;

export const noop: Disposer = () => {};

export function resolveTarget(options: CmpAdapterOptions | undefined): CmpTarget | null {
  if (options?.target) return options.target;
  const win = (globalThis as { window?: unknown }).window;
  return win && typeof (win as CmpTarget).addEventListener === 'function' ? (win as CmpTarget) : null;
}

/**
 * Build a record. `state` follows marketing consent: storageAllowed() only
 * checks `state`, so analytics-only consent must not unlock attribution storage
 * (same rule as the ClickTrail WordPress consent bridge).
 */
export function toRecord(
  purposes: { marketing: boolean; analytics: boolean },
  source: string,
  now: () => Date,
): ConsentRecord {
  return {
    state: purposes.marketing ? 'granted' : 'denied',
    marketing: purposes.marketing,
    advertising: purposes.marketing,
    analytics: purposes.analytics,
    source,
    at: now().toISOString(),
  };
}

/** Notify only when the decision actually changed (CMPs fire several events per click). */
export function createEmitter(hub: ConsentHub): (record: ConsentRecord) => void {
  let last = '';
  return (record) => {
    const key = `${record.state}|${record.marketing}|${record.analytics}`;
    if (key === last) return;
    last = key;
    hub.notify(record);
  };
}
