/**
 * Apointoo outcome destination — batched, retried, minimized delivery of
 * verified outcomes back to the Apointoo API with journey attribution.
 *
 * Division of labor (docs/ARCHITECTURE.md): Apointoo owns appointments and
 * billing; ClickTrail owns journey correlation. This subpath only DELIVERS
 * outcome events enriched with captured attribution — it never manages
 * appointments or holds business state.
 *
 * AUTH LAW (docs/guides/SECURITY-PRIVACY.md): the browser NEVER holds
 * permanent secrets. The module accepts only a SHORT-LIVED, SCOPED token,
 * supplied via the injected `getToken` provider, issued by the HOST'S OWN
 * SERVER from its Apointoo credentials:
 *
 *   browser -> host backend  ("mint me a delivery token")
 *   host backend -> Apointoo (server-to-server auth with host credentials)
 *   host backend -> browser  (short-TTL token scoped to outcome intake)
 *   browser -> Apointoo      (Authorization: Bearer <token>, until expiry)
 *
 * When the token expires the host mints a fresh one; this module simply
 * calls getToken() again per send. There are NO secret-bearing defaults;
 * if getToken is omitted no Authorization header is sent.
 *
 * EFFECT SEAMS (all injectable, deterministic tests):
 * - `fetch`     : transport. Default wraps global fetch lazily inside start().
 * - `sign`      : returns extra headers for a body (e.g. an HMAC produced by
 *                 host-supplied non-secret material). Must not embed secrets.
 * - `jitter`    : randomness source [0,1) for backoff jitter. Injected.
 * - `sleep`     : delay clock. Injected; default uses setTimeout.
 * - `getJourneyContext` : returns the captured attribution payload; its
 *                 allowlisted keys enrich delivered outcome events.
 *
 * DROPPED-BATCH LAW: when retries are exhausted the batch is surfaced via
 * `onDropped` — never silently discarded.
 */
import type { Destination } from '@vizuh/clicktrail-browser';
import {
  buildOutcomeEvent,
  isOutcomeEvent,
  stripToOutcomeRecord,
  WIRE_JOURNEY_ID,
  type OutcomeInput,
} from './outcome.js';

/** Minimal response surface this destination needs from transport. */
export interface ApointooFetchResponse {
  ok: boolean;
  /** HTTP status when available; surfaced on dropped batches. */
  status?: number;
}

export type ApointooFetchFn = (
  endpoint: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<ApointooFetchResponse>;

/**
 * Returns extra headers for one serialized body (e.g. a signature header).
 * AUTH LAW: implementations must not read long-lived secrets in the browser.
 */
export type SignFn = (
  body: string,
) => Record<string, string> | Promise<Record<string, string>>;

/** Surfaced (never silent) dropped batch. */
export interface DroppedBatch {
  /** Minimized records that failed delivery after all retries. */
  events: Record<string, unknown>[];
  attempts: number;
  lastStatus?: number;
  reason: 'delivery_failed';
}

export interface ApointooDestinationConfig {
  /** Apointoo outcome-intake URL. */
  endpoint: string;
  /** Events buffered before an automatic flush. Default 10. */
  batchSize?: number;
  /** Retry attempts AFTER the first failure. Default 3. */
  maxRetries?: number;
  /** Base backoff delay in ms; attempt n waits base * 2^(n-1) * (1 + jitter). Default 500. */
  baseDelayMs?: number;
  /**
   * Short-lived scoped token provider (AUTH LAW above). Called once per
   * send attempt so expired tokens rotate naturally. Optional.
   */
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetch?: ApointooFetchFn;
  sign?: SignFn;
  /** Captured attribution context enriching every outcome event. */
  getJourneyContext?: () => Record<string, unknown> | undefined;
  /** Jitter source in [0,1). INJECTED for determinism. */
  jitter?: () => number;
  /** Delay clock. INJECTED for determinism. */
  sleep?: (ms: number) => Promise<void>;
  /** Called when a batch exhausts its retry cap. */
  onDropped?: (dropped: DroppedBatch) => void;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultFetchFn(): ApointooFetchFn {
  return async (endpoint, init) => {
    const res = await fetch(endpoint, init);
    return { ok: res.ok };
  };
}

export interface ApointooDestination extends Destination {
  readonly name: 'apointoo';
}

/**
 * Batched outcome destination for the commercial loop. Only OUTCOME events
 * (`lead_created`, `lead_qualified`, `booking_created`,
 * `booking_completed`, `sale`, `refund`) are processed;
 * other event names are ignored by design — this lane carries outcomes only.
 */
export function createApointooDestination(
  config: ApointooDestinationConfig,
): ApointooDestination {
  const batchSize = Math.max(1, config.batchSize ?? DEFAULT_BATCH_SIZE);
  const maxRetries = Math.max(0, config.maxRetries ?? DEFAULT_MAX_RETRIES);
  const baseDelayMs = Math.max(0, config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const jitter = config.jitter ?? (() => 0);
  const sleep = config.sleep ?? defaultSleep;

  let fetchFn: ApointooFetchFn | undefined = config.fetch;
  let batch: Record<string, unknown>[] = [];
  const pending: Promise<void>[] = [];
  let deliveryGeneration = 0;

  /** Enrichment + minimization happen HERE, at the browser boundary. */
  const minimize = (
    event: Record<string, unknown>,
  ): Record<string, unknown> | null => {
    const name = event['event_name'];
    if (!isOutcomeEvent(name)) return null;

    // Explicit fields on the delivered event win; captured ctx fills gaps.
    const ctx = config.getJourneyContext?.() ?? {};
    const input: OutcomeInput = {
      journeyId:
        typeof event[WIRE_JOURNEY_ID] === 'string' && event[WIRE_JOURNEY_ID] !== ''
          ? (event[WIRE_JOURNEY_ID] as string)
          : typeof ctx[WIRE_JOURNEY_ID] === 'string'
            ? (ctx[WIRE_JOURNEY_ID] as string)
            : '',
    };
    if (input.journeyId === '') return null;
    if (typeof event['value'] === 'number') input.value = event['value'];
    else if (typeof ctx['value'] === 'number') input.value = ctx['value'];
    if (typeof event['currency'] === 'string') input.currency = event['currency'];
    else if (typeof ctx['currency'] === 'string') input.currency = ctx['currency'];
    if (typeof event['outcome.id'] === 'string') input.outcomeId = event['outcome.id'];
    else if (typeof ctx['outcome.id'] === 'string') input.outcomeId = ctx['outcome.id'];

    try {
      return buildOutcomeEvent(name, input, { ...ctx, ...event });
    } catch {
      return null;
    }
  };

  const sendWithRetries = async (): Promise<void> => {
    if (batch.length === 0) return;
    const events = batch;
    batch = [];
    await deliverBatch(events);
  };

  const deliverBatch = async (events: Record<string, unknown>[]): Promise<void> => {
    const generation = deliveryGeneration;
    const f = fetchFn ?? (fetchFn = defaultFetchFn());
    const body = JSON.stringify({ events });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.sign) Object.assign(headers, await config.sign(body));
    const token = await config.getToken?.();
    if (token !== undefined && token !== '') {
      headers['authorization'] = `Bearer ${token}`;
    }

    let lastStatus: number | undefined;
    for (let attempt = 0; ; attempt++) {
      if (generation !== deliveryGeneration) return;
      try {
        const res = await f(config.endpoint, { method: 'POST', headers, body });
        if (res.ok) return;
        lastStatus = res.status;
      } catch {
        // Network error counts as a failed attempt; retry below.
      }
      if (attempt >= maxRetries) break;
      const delay = baseDelayMs * 2 ** attempt * (1 + jitter());
      await sleep(delay);
      if (generation !== deliveryGeneration) return;
    }
    // DROPPED-BATCH LAW: never silently lost.
    config.onDropped?.({ events, attempts: maxRetries + 1, reason: 'delivery_failed', ...(lastStatus !== undefined ? { lastStatus } : {}) });
  };

  const flushTracked = (): void => {
    const p = sendWithRetries().catch(() => undefined);
    pending.push(p);
    p.finally(() => {
      const i = pending.indexOf(p);
      if (i >= 0) pending.splice(i, 1);
    });
  };

  return {
    name: 'apointoo',
    start() {
      // Resolve the transport here, never at import time (SSR-safe).
      fetchFn ??= config.fetch ?? (typeof fetch === 'function' ? defaultFetchFn() : undefined);
    },
    deliver(event: Record<string, unknown>) {
      const record = minimize(event as Record<string, unknown>);
      if (!record) return;
      batch.push(record);
      if (batch.length >= batchSize) flushTracked();
    },
    async flush() {
      await sendWithRetries();
      await Promise.all([...pending]);
    },
    clear() {
      batch = [];
      deliveryGeneration += 1;
    },
  };
}
