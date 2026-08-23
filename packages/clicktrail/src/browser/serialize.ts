/**
 * Outbound event serialization.
 *
 * Builds the wire/event payload from the canonical flat AttributionPayload.
 * Every outbound event ALWAYS carries `schema_version` + `classifier_version`
 * (via core's {@link stampVersions}). Deterministic: the caller supplies any
 * timestamp through the optional `data` bag (e.g. `event_time`).
 */
import { stampVersions } from '../core/merge.js';
import type { AttributionPayload } from '../core/types.js';

/**
 * A stamped, ready-to-deliver ClickTrail event.
 * Flat shape: `event_name`, all canonical payload keys, caller data,
 * then version stamps last-writer-wins.
 */
export type ClickTrailEvent = Record<string, unknown> & {
  event_name: string;
  schema_version: string;
  classifier_version: string;
};

/**
 * Build an outbound event from the canonical payload + event name + optional
 * caller data. Never mutates the inputs. Caller data is merged AFTER the
 * canonical payload so hosts may attach extra context (and override
 * `event_time` with their own injected-clock value).
 */
export function buildEventPayload(
  payload: AttributionPayload,
  eventName: string,
  data?: Record<string, unknown>,
): ClickTrailEvent {
  const base: Record<string, unknown> = { ...payload };
  if (data) Object.assign(base, data);
  base.event_name = eventName;
  return stampVersions(base) as ClickTrailEvent;
}
