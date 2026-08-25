/**
 * Server-side landing attribution capture.
 *
 * Pure module: parses the landing URL (+ external referrer) with the frozen
 * core engine and merges the resulting touch into the flat canonical payload
 * carried by the `ct_attribution` cookie. First-touch stays write-once,
 * last-touch updates on every new signal — identical to browser-side merges.
 */
import { mergeAttributionTouch, emptyAttribution, parseAttributionUrl } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';

export interface LandingCaptureInput {
  /** Full request URL including query string. */
  url: string;
  /** External referrer from the Referer header ('' when absent). */
  referrer?: string;
  /** Host of the current site, used to ignore internal referrals. */
  currentHost?: string;
  /** Previously stored flat payload (from ct_attribution / attribution). */
  stored?: AttributionPayload;
  /**
   * Millisecond ISO-8601 timestamp — exactly what Date#toISOString emits.
   * Callers own the clock so this module stays deterministic.
   */
  now: string;
}

export interface LandingCaptureResult {
  /** Payload after merging any new touch. */
  payload: AttributionPayload;
  /** True when a touch was parsed from this request. */
  captured: boolean;
  /** True when merging changed the payload and a cookie write is warranted. */
  changed: boolean;
}

/** Capture landing attribution for one server request. Pure. */
export function captureLandingAttribution(input: LandingCaptureInput): LandingCaptureResult {
  const stored = input.stored ?? {};
  const result = parseAttributionUrl({
    url: input.url,
    ...(input.referrer ? { referrer: input.referrer } : {}),
    ...(input.currentHost ? { currentHost: input.currentHost } : {}),
    now: input.now,
  });
  if (result.kind !== 'touch') {
    return { payload: stored, captured: false, changed: false };
  }
  const merged = mergeAttributionTouch(Object.keys(stored).length > 0 ? stored : emptyAttribution(), result.touch);
  const changed = JSON.stringify(merged) !== JSON.stringify(stored);
  return { payload: merged, captured: true, changed };
}
