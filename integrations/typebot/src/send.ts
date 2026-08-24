/**
 * HTTP send boundary.
 *
 * GUARANTEE: sendEvents() resolves { ok, status } and NEVER throws into the
 * host flow. A chatbot must never break because analytics is down — network
 * failures, bad responses, and encoding errors all collapse to { ok: false }.
 */
import type { ResolvedTypebotBlockConfig } from './config.js';
import type { BlockEvent } from './events.js';

export interface SendResult {
  ok: boolean;
  /** HTTP status when a response was received; undefined on network/encode errors. */
  status?: number;
  /** Short machine-readable reason when ok is false. */
  error?: string;
}

export const CLICKTRAIL_KEY_HEADER = 'X-ClickTrail-Key';

/** Minimal response surface used from fetch (eases test injection). */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
}

export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<FetchLikeResponse>;

function defaultFetch(): FetchLike | undefined {
  if (typeof globalThis.fetch === 'function') {
    return (url, init) => globalThis.fetch(url, init) as Promise<FetchLikeResponse>;
  }
  return undefined;
}

/**
 * POST `{ events: [...] }` to the configured endpoint with
 * `content-type: application/json` and, when an API key is configured, the
 * `X-ClickTrail-Key` header. Never throws.
 */
export async function sendEvents(
  events: readonly BlockEvent[],
  config: ResolvedTypebotBlockConfig,
  fetchImpl?: FetchLike,
): Promise<SendResult> {
  if (events.length === 0) return { ok: true, status: 200 };
  try {
    const doFetch = fetchImpl ?? defaultFetch();
    if (!doFetch) return { ok: false, error: 'no_fetch_available' };

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.apiKey !== undefined) headers[CLICKTRAIL_KEY_HEADER] = config.apiKey;

    const response = await doFetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events }),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.name : 'unknown_error',
    };
  }
}
