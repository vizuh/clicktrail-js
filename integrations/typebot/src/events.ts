/**
 * Event builders for the eight Typebot actions.
 *
 * PURE functions of (mappedVariables, config) -> event object. The clock is
 * passed in as a string stamp; no network, no globals, no randomness
 * (identity comes from Typebot variables).
 *
 * Validation contract (mirrors n8n-nodes-clicktrail / piece-clicktrail):
 * - Required money/id fields throw TypeError with '<action>.<field>' wording.
 * - Builders throw synchronously; the async factory methods in index.ts wrap
 *   them so callers observe rejections as promises.
 */
import type { ResolvedTypebotBlockConfig } from './config.js';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';
import {
  mapVariables,
  mergeVariables,
  type ConsentState,
} from './variables.js';

export const EVENT_NAMES = {
  identifyVisitor: 'lead_created',
  formStarted: 'form_started',
  leadSubmitted: 'lead_created',
  qualifiedLead: 'lead_qualified',
  appointmentRequested: 'booking_created',
  purchase: 'sale',
  consent: (state: ConsentState): string => `consent.${state}`,
} as const;

export interface BlockEvent {
  schema_version: 1;
  event_name: string;
  occurred_at: string;
  site_id?: string;
  workspace_id?: string;
  email?: string;
  phone?: string;
  lead_id?: string;
  campaign?: string;
  gclid?: string;
  value?: number | string;
  currency?: string;
  transaction_id?: string;
  consent_state?: ConsentState;
  properties?: Record<string, unknown>;
}

/** Everything a builder needs beyond the mapped variables. */
export interface BuildMeta {
  readonly config: ResolvedTypebotBlockConfig;
  /** Millisecond-precision ISO-8601 stamp supplied by the injected clock. */
  readonly occurredAt: string;
}

export type VariableBag = Record<string, unknown>;

function baseEvent(rawName: string, meta: BuildMeta): BlockEvent {
  const eventName = toCanonicalEventName(rawName);
  const event: BlockEvent = {
    schema_version: 1,
    event_name: eventName,
    occurred_at: meta.occurredAt,
  };
  if (meta.config.siteId !== undefined) event.site_id = meta.config.siteId;
  if (meta.config.workspaceId !== undefined) event.workspace_id = meta.config.workspaceId;
  return event;
}

function requireField(action: string, field: string, value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
  if (raw === '') {
    throw new TypeError(`${action}.${field} is required`);
  }
  return raw;
}

const MAPPED_EVENT_KEYS = [
  'email',
  'phone',
  'lead_id',
  'campaign',
  'gclid',
  'value',
  'consent_state',
] as const;

/** Copy mapped canonical fields + extra properties from a merged payload. */
function applyMapped(event: BlockEvent, payload: Record<string, unknown>): void {
  for (const key of MAPPED_EVENT_KEYS) {
    const value = payload[key];
    if (value !== undefined) (event as unknown as Record<string, unknown>)[key] = value;
  }
  const properties = payload['properties'];
  if (
    typeof properties === 'object' &&
    properties !== null &&
    !Array.isArray(properties)
  ) {
    event.properties = properties as Record<string, unknown>;
  }
}

/* ------------------------------------------------------------------ */
/* Action 1 — Identify Visitor/Lead                                    */
/* ------------------------------------------------------------------ */
export function buildLeadEvent(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const event = baseEvent(EVENT_NAMES.identifyVisitor, meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(variables).mapped));
  return event;
}

/* ------------------------------------------------------------------ */
/* Actions 2 & 3 — Form Started / Lead Submitted                       */
/* ------------------------------------------------------------------ */
export function buildFormStartedEvent(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const event = baseEvent(EVENT_NAMES.formStarted, meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(variables).mapped));
  return event;
}

export function buildFormSubmittedEvent(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const event = baseEvent(EVENT_NAMES.leadSubmitted, meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(variables).mapped));
  return event;
}

/* ------------------------------------------------------------------ */
/* Action 4 — Qualified Lead (leadId REQUIRED)                         */
/* ------------------------------------------------------------------ */
export function buildQualifiedLeadEvent(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const merged = mergeVariables(currentPayload, mapVariables(variables).mapped);
  const leadId = requireField('lead_qualified', 'lead_id', merged['lead_id']);
  const event = baseEvent(EVENT_NAMES.qualifiedLead, meta);
  event.lead_id = leadId;
  applyMapped(event, { ...merged, lead_id: leadId });
  return event;
}

/* ------------------------------------------------------------------ */
/* Action 5 — Appointment Requested                                    */
/* ------------------------------------------------------------------ */
export function buildAppointmentRequestedEvent(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const event = baseEvent(EVENT_NAMES.appointmentRequested, meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(variables).mapped));
  return event;
}

/* ------------------------------------------------------------------ */
/* Action 6 — Purchase (transactionId/value/currency REQUIRED)         */
/* ------------------------------------------------------------------ */
export interface PurchaseInput extends VariableBag {
  transactionId?: unknown;
  value?: unknown;
  currency?: unknown;
}

export function buildPurchaseEvent(
  input: PurchaseInput,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const transactionId = requireField('sale', 'transaction_id', input.transactionId);

  const valueRaw =
    typeof input.value === 'number' ? input.value : Number(String(input.value ?? '').trim());
  if (!Number.isFinite(valueRaw) || valueRaw <= 0) {
    throw new TypeError('sale.value is required and must be a positive finite number');
  }

  const currency = requireField('sale', 'currency', input.currency).toUpperCase();

  const event = baseEvent(EVENT_NAMES.purchase, meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(input).mapped));
  event.transaction_id = transactionId;
  event.value = valueRaw;
  event.currency = currency;
  return event;
}

/* ------------------------------------------------------------------ */
/* Action 7 — Update Consent                                           */
/* ------------------------------------------------------------------ */
export function buildConsentUpdateEvent(
  state: ConsentState,
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  meta: BuildMeta,
): BlockEvent {
  const event = baseEvent(EVENT_NAMES.consent(state), meta);
  applyMapped(event, mergeVariables(currentPayload, mapVariables(variables).mapped));
  event.consent_state = state;
  return event;
}

/* ------------------------------------------------------------------ */
/* Action 8 — Attach Variables as Properties                           */
/* ------------------------------------------------------------------ */
/**
 * Pure attribution passthrough: merges the mapped variables (utm_campaign ->
 * campaign, gclid -> gclid click id) plus arbitrary extra properties onto the
 * CURRENT visitor payload and returns the NEXT payload. Sends nothing by
 * itself; subsequent events carry the merged fields until changed.
 */
export function attachVariablesToPayload(
  variables: VariableBag,
  currentPayload: Record<string, unknown> = {},
  extraProperties: VariableBag = {},
): Record<string, unknown> {
  const { mapped, extra } = mapVariables(variables);
  // Explicit JSON extras win over same-named unmapped variables.
  return mergeVariables(currentPayload, mapped, { ...extra, ...extraProperties });
}
