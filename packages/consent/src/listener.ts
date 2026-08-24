/**
 * Consent-update listener hub with injected seams (no DOM at import time).
 *
 * Integrations subscribe; the host's CMP callback notifies via notify().
 * Withdrawal handling: subscribers receive the FULL record so they can wipe
 * persisted state on denial (clearAttributionStorage remains the SDK's job).
 */
import type { ConsentRecord } from './types.js';

export type ConsentListener = (record: ConsentRecord) => void;

export interface ConsentHub {
  subscribe(listener: ConsentListener): () => void;
  notify(record: ConsentRecord): void;
  latest(): ConsentRecord | null;
}

export function createConsentHub(): ConsentHub {
  let listeners: ConsentListener[] = [];
  let last: ConsentRecord | null = null;
  return {
    subscribe(listener) {
      listeners.push(listener);
      if (last) listener(last);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    notify(record) {
      last = record;
      for (const l of [...listeners]) l(record);
    },
    latest() {
      return last;
    },
  };
}
