/**
 * PURE Chatwoot attribute builder (`/conversation`).
 *
 * Builds the custom-attribute map a host attaches to a Chatwoot contact or
 * conversation. NO network calls, NO I/O anywhere in this module: input in,
 * attribute map out, byte-identical for identical inputs.
 *
 * Chatwoot custom attributes are flat string -> string pairs, which matches
 * the canonical flat AttributionPayload exactly — summary and click-ID keys
 * are copied verbatim under their canonical names so nothing is renamed or
 * lost between surfaces.
 */
import { CLICK_ID_KEYS } from '../core/knowledge.js';
import type { AttributionPayload } from '../core/types.js';

/** Chatwoot custom-attribute key carrying the durable journey id. */
export const CHATWOOT_JOURNEY_ATTRIBUTE = 'ct_journey_id';

/**
 * Canonical attribution-summary keys surfaced to Chatwoot, in stable order:
 * channel labels + core first/last-touch dimensions + touch timestamps.
 */
export const CHATWOOT_ATTRIBUTION_SUMMARY_KEYS: readonly string[] = [
  'ft_channel',
  'ft_source',
  'ft_medium',
  'ft_campaign',
  'ft_term',
  'ft_content',
  'ft_touch_timestamp',
  'lt_channel',
  'lt_source',
  'lt_medium',
  'lt_campaign',
  'lt_term',
  'lt_content',
  'lt_touch_timestamp',
];

export interface ChatwootAttributesInput {
  /** Durable cross-session journey id (empty => omitted from the map). */
  journeyId: string;
  /** Canonical flat attribution payload (clickTrail.getData()). */
  attribution: AttributionPayload;
}

/**
 * Build the Chatwoot custom-attribute map: `ct_journey_id` + the
 * attribution summary + every ad click ID present in the payload.
 * Empty/absent values are omitted; key order is stable.
 */
export function buildChatwootAttributes(
  input: ChatwootAttributesInput,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (input.journeyId !== '') attrs[CHATWOOT_JOURNEY_ATTRIBUTE] = input.journeyId;
  for (const key of [...CHATWOOT_ATTRIBUTION_SUMMARY_KEYS, ...CLICK_ID_KEYS]) {
    const value = input.attribution[key];
    if (value !== undefined && value !== '') attrs[key] = value;
  }
  return attrs;
}
