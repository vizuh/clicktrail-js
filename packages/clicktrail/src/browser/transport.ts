/**
 * Transport destinations. ALL side effects (network, globals) live behind
 * the injected/default `send` function or inside lifecycle methods called
 * only after `start()` — never at import time.
 */
import type { ClickTrailEvent } from './serialize.js';

/** A consumer of stamped events. Hosts supply these to createClickTrail. */
export interface Destination {
  readonly name: string;
  /**
   * Called once when the SDK starts. Create runtime resources (e.g. the
   * dataLayer array reference) HERE, never at factory/import time.
   */
  start?(): void;
  deliver(event: ClickTrailEvent): void;
  /** Drain any buffered events (e.g. on page hide or stop()). */
  flush?(): void | Promise<void>;
}

/** Injected side-effect boundary: transmits a pre-encoded JSON body. */
export type SendFn = (endpoint: string, body: string) => void | Promise<void>;

export interface HttpDestinationConfig {
  endpoint: string;
  /** Events buffered before an automatic flush. Default 10. */
  batchSize?: number;
  /** Use navigator.sendBeacon when available. Default true. */
  beacon?: boolean;
  /**
   * Injected sender. Default implementation wraps the real browser APIs
   * (sendBeacon -> fetch keepalive fallback). Tests inject a fake here.
   */
  send?: SendFn;
}

const DEFAULT_BATCH_SIZE = 10;

function defaultSend(useBeacon: boolean): SendFn {
  return (endpoint, body) => {
    if (
      useBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body,
    });
  };
}

/**
 * Batched HTTP destination. Buffers up to `batchSize` events, then flushes
 * `{ events: [...] }` as JSON through the injected sender.
 */
export function httpDestination(config: HttpDestinationConfig): Destination {
  const batchSize = Math.max(1, config.batchSize ?? DEFAULT_BATCH_SIZE);
  const useBeacon = config.beacon ?? true;
  const send = config.send ?? defaultSend(useBeacon);

  let batch: ClickTrailEvent[] = [];

  const flushBatch = (): void => {
    if (batch.length === 0) return;
    const body = JSON.stringify({ events: batch });
    batch = [];
    void Promise.resolve(send(config.endpoint, body));
  };

  return {
    name: 'http',
    deliver(event) {
      batch.push(event);
      if (batch.length >= batchSize) flushBatch();
    },
    flush: flushBatch,
  };
}

export interface DataLayerDestinationConfig {
  /**
   * Injected target array (e.g. an existing window.dataLayer). When omitted,
   * the array is created inside start()/first deliver — never on import.
   */
  dataLayer?: unknown[];
}

/**
 * Pushes stamped payloads into a dataLayer array (tag-manager bridge).
 */
export function dataLayerDestination(
  config: DataLayerDestinationConfig = {},
): Destination & { getArray(): unknown[] } {
  let arr: unknown[] | undefined = config.dataLayer;

  return {
    name: 'dataLayer',
    start() {
      arr ??= [];
    },
    deliver(event) {
      (arr ??= []).push(event);
    },
    getArray() {
      return arr ??= [];
    },
  };
}
