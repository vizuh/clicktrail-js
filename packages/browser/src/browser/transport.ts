/**
 * Transport destinations. ALL side effects (network, globals) live behind
 * the injected/default `send` function or inside lifecycle methods called
 * only after `start()` — never at import time.
 */
import type { StampedClickTrailEvent } from './serialize.js';

/** A consumer of stamped events. Hosts supply these to createClickTrail. */
export interface Destination {
  readonly name: string;
  /**
   * Called once when the SDK starts. Create runtime resources (e.g. the
   * dataLayer array reference) HERE, never at factory/import time.
   * `context.canSend()` rechecks consent for sends the destination starts on
   * its own (e.g. a timer); a denied check also clears the queues.
   */
  start?(context?: DestinationContext): void;
  stop?(): void;
  deliver(event: StampedClickTrailEvent): void;
  /** Drain any buffered events (e.g. on page hide or stop()). */
  flush?(): void | Promise<void>;
  /** Discard buffered events without delivering them. */
  clear(): void;
}

/** Passed to Destination.start() by createClickTrail. */
export interface DestinationContext {
  canSend(): boolean;
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
  /** Called with a batch that could not be delivered. */
  onDropped?: (events: readonly StampedClickTrailEvent[], error: unknown) => void;
  /**
   * Flush a partial batch this many ms after its oldest event was buffered.
   * Default 5000. `0` disables the timer (flush only on batch size, page
   * hide or stop()). The timer is armed only when an event is buffered.
   */
  maxAgeMs?: number;
  /**
   * Injected timer for the max-age flush: schedule `fn` after `ms` and
   * return a cancel function. Default wraps setTimeout/clearTimeout.
   */
  schedule?: (fn: () => void, ms: number) => () => void;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_AGE_MS = 5000;

function defaultSchedule(fn: () => void, ms: number): () => void {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
}

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
    return fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body,
    }).then((response) => {
      if (!response.ok) throw new Error(`clicktrail: collector returned HTTP ${response.status}.`);
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
  const maxAgeMs = Math.max(0, config.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  const schedule = config.schedule ?? defaultSchedule;

  let batch: StampedClickTrailEvent[] = [];
  let canSend: () => boolean = () => true;
  let cancelTimer: (() => void) | null = null;
  const stopTimer = (): void => {
    cancelTimer?.();
    cancelTimer = null;
  };

  const flushBatch = async (): Promise<void> => {
    stopTimer();
    if (batch.length === 0) return;
    const events = batch;
    batch = [];
    try {
      const body = JSON.stringify({ events });
      await send(config.endpoint, body);
    } catch (error) {
      // Do not let an optional host diagnostic callback create an unhandled
      // rejection or change the at-most-once transport contract.
      try {
        config.onDropped?.(events, error);
      } catch {
        // Host diagnostics are best effort.
      }
    }
  };

  return {
    name: 'http',
    start(context) {
      if (context) canSend = () => context.canSend();
    },
    deliver(event) {
      batch.push(event);
      if (batch.length >= batchSize) void flushBatch();
      else if (maxAgeMs > 0 && cancelTimer === null) {
        cancelTimer = schedule(() => {
          cancelTimer = null;
          // Fail closed: a denied gate clears the batch instead of sending it.
          if (canSend()) void flushBatch();
        }, maxAgeMs);
      }
    },
    flush: flushBatch,
    clear() {
      stopTimer();
      batch = [];
    },
  };
}

/**
 * Version of the dataLayer push shape (the GTM bridge contract), stamped on
 * every push as `datalayer_version`. Independent of `schema_version` (the
 * canonical payload, unchanged) and `classifier_version`.
 *
 * 1.0.0 (unstamped): every canonical key pushed flat, `event` = `event_name`.
 * 2.0.0: Google tag field names are prefixed and the canonical `page_view`
 * is pushed as `event: 'ct_page_view'` (see GOOGLE_TAG_RESERVED_FIELDS).
 */
export const DATALAYER_VERSION = '2.0.0' as const;

/**
 * Flat keys the Google tag (gtag.js / GA4) interprets as its own fields
 * rather than free event parameters. A GA4 Event tag that maps one of these
 * from the dataLayer overrides Google's value — e.g. `session_id` replaces
 * the `_ga_<property>` session (`sid`) and splits sessions.
 */
export const GOOGLE_TAG_RESERVED_FIELDS = [
  'session_id',
  'client_id',
  'user_id',
  'session_number',
  'engagement_time_msec',
  'timestamp_micros',
  'page_location',
  'page_referrer',
] as const;

/** Default prefix applied to GOOGLE_TAG_RESERVED_FIELDS in dataLayer pushes. */
export const DEFAULT_RESERVED_FIELD_PREFIX = 'ct_';

/** Default GTM `event` value for the canonical `page_view`. */
export const DEFAULT_DATALAYER_PAGE_VIEW_EVENT = 'ct_page_view';

export interface DataLayerDestinationConfig {
  /**
   * Injected target array (e.g. an existing window.dataLayer). When omitted,
   * the array is created inside start()/first deliver — never on import.
   */
  dataLayer?: unknown[];
  /**
   * Prefix for flat keys listed in GOOGLE_TAG_RESERVED_FIELDS
   * (`session_id` -> `ct_session_id`). Default `'ct_'`; must not be empty.
   * The nested `marketing_trail` envelope is never renamed.
   */
  reservedFieldPrefix?: string;
  /**
   * GTM `event` value pushed for the canonical `page_view`. Default
   * `'ct_page_view'`, so a catch-all GA4 Event tag cannot duplicate the
   * Google tag's own page_view. `event_name` stays `'page_view'`.
   */
  pageViewEvent?: string;
}

/**
 * Pushes stamped payloads into a dataLayer array (tag-manager bridge).
 * Push shape: DATALAYER_VERSION.
 */
export function dataLayerDestination(
  config: DataLayerDestinationConfig = {},
): Destination & { getArray(): unknown[] } {
  let arr: unknown[] | undefined = config.dataLayer;
  const prefix = config.reservedFieldPrefix ?? DEFAULT_RESERVED_FIELD_PREFIX;
  const pageViewEvent = config.pageViewEvent ?? DEFAULT_DATALAYER_PAGE_VIEW_EVENT;
  if (prefix === '') {
    // An empty prefix would push the Google tag field names unchanged.
    throw new TypeError('dataLayerDestination: reservedFieldPrefix must not be empty');
  }

  return {
    name: 'dataLayer',
    start() {
      arr ??= [];
    },
    deliver(event) {
      const push: Record<string, unknown> = { ...event };
      for (const key of GOOGLE_TAG_RESERVED_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(push, key)) continue;
        // The renamed value wins over a caller key of the same name.
        push[prefix + key] = push[key];
        delete push[key];
      }
      push['event'] = event.event_name === 'page_view' ? pageViewEvent : event.event_name;
      push['datalayer_version'] = DATALAYER_VERSION;
      (arr ??= []).push(push);
    },
    clear() {},
    getArray() {
      return arr ??= [];
    },
  };
}
