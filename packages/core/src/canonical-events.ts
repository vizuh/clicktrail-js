/**
 * Canonical ClickTrail event contract (docs/EVENT-CONTRACT.md).
 *
 * Every integration emits THESE names through shared builders. Platform code
 * never invents event vocabulary. Extension events are permitted but must not
 * be required by consumers.
 */
export const CANONICAL_EVENT_NAMES = [
  'page_view',
  'form_started',
  'lead_created',
  'lead_qualified',
  'booking_created',
  'booking_completed',
  'sale',
  'refund',
  'consent_updated',
] as const;

export type CanonicalEventName = (typeof CANONICAL_EVENT_NAMES)[number];

/** Permitted non-canonical events (consumers may ignore; integrations may emit). */
export const EXTENSION_EVENT_NAMES = ['lead_updated', 'lead_merged', 'visitor_anonymized'] as const;

export type KnownEventName = CanonicalEventName | (typeof EXTENSION_EVENT_NAMES)[number];

/**
 * Translation table: pre-contract scaffold names -> canonical events.
 * One mapping module so renames stay one-file changes (council ruling).
 */
export const EXTENSION_EVENT_NAME_MAP: Readonly<Record<string, string>> = {
  // R2 default adopted: stage changes + visitor merges are EXTENSION events
  // outside the canonical nine (consumers may ignore).
  'lead.stage_updated': 'lead_updated',
  'lead.merged': 'lead_merged',
  'visitor.anonymized': 'visitor_anonymized',
};

export const LEGACY_EVENT_NAME_MAP: Readonly<Record<string, string>> = {
  lead: 'lead_created',
  'form.started': 'form_started',
  'form.submitted': 'lead_created',
  'lead.submitted': 'lead_created',
  lead_submitted: 'lead_created',
  form_submission: 'lead_created',
  'lead.attribution_attached': 'lead_created',
  ...EXTENSION_EVENT_NAME_MAP,
  'lead.qualified': 'lead_qualified',
  booking: 'booking_created',
  'appointment.booked': 'booking_created',
  'appointment.requested': 'booking_created',
  'appointment.attended': 'booking_completed',
  'appointment.completed': 'booking_completed',
  'sale.completed': 'sale',
  'sale.recorded': 'sale',
  purchase: 'sale',
  'revenue.recurring': 'sale',
  'offline_conversion.sent': 'sale',
  'sale.refunded': 'refund',
  'refund.issued': 'refund',
  'consent.granted': 'consent_updated',
  'consent.withdrawn': 'consent_updated',
  'consent.policy_updated': 'consent_updated',
};

/**
 * Resolve any historical/scaffold event name to its canonical name.
 * Canonical and known-extension names pass through; free-form strings are
 * returned unchanged (Track Event style actions) so hosts keep flexibility.
 */
export function toCanonicalEventName(eventName: string): CanonicalEventName | string {
  return LEGACY_EVENT_NAME_MAP[eventName] ?? eventName;
}

export function isCanonicalEventName(eventName: string): eventName is CanonicalEventName {
  return (CANONICAL_EVENT_NAMES as readonly string[]).includes(eventName);
}

/** Field vocabulary every canonical event may carry (subset per event). */
export const CANONICAL_EVENT_FIELDS = [
  'event_id', 'event_name', 'occurred_at', 'site_id', 'workspace_id',
  'visitor_id', 'session_id', 'lead_id', 'contact_id', 'booking_id',
  'order_id', 'value', 'currency', 'landing_url', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
  'consent_state', 'consent_source', 'consent_version',
] as const;

export type CanonicalEventField = (typeof CANONICAL_EVENT_FIELDS)[number];
