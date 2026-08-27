/**
 * Pure ClickTrail action-event builders for the Activepieces piece.
 *
 * ZERO @activepieces imports by design: this module is intentionally shaped
 * like packages/n8n-nodes-clicktrail's src/events.ts so a future refactor can
 * lift both into @vizuh/clicktrail as one shared builder layer. See NOTE.md.
 *
 * Each builder validates its inputs and returns `{ eventName, data }`.
 * Use {@link buildActionEvent} to stamp a builder result through the common
 * SDK layer (`buildEventPayload`) into a wire-ready ClickTrailEvent.
 */
import { buildEventPayload } from '@vizuh/clicktrail/browser';
import type {
  ClickTrailEvent,
  MarketingTrailContext,
} from '@vizuh/clicktrail/browser';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';

/** Action -> outbound event name. Shared contract with the n8n node builders. */
export const ACTION_EVENT_NAMES = {
  trackEvent: null, // free-string event name supplied per call
  identifyLead: 'lead_created',
  attachAttribution: 'lead_created',
  recordBooking: 'booking_created',
  recordQualifiedLead: 'lead_qualified',
  recordSale: 'sale',
  recordRefund: 'refund',
  // Legacy dropdown values stay accepted so saved Activepieces flows migrate safely.
  consentGranted: 'consent.granted',
  consentWithdrawn: 'consent.withdrawn',
  consentPolicyUpdated: 'consent.policy_updated',
} as const;

export const CONSENT_EVENT_NAMES = [
  ACTION_EVENT_NAMES.consentGranted,
  ACTION_EVENT_NAMES.consentWithdrawn,
  ACTION_EVENT_NAMES.consentPolicyUpdated,
] as const;

export type ConsentEventName = (typeof CONSENT_EVENT_NAMES)[number];

export interface BuilderResult {
  eventName: string;
  data: Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`clicktrail: ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = requireNonEmptyString(value, field);
  return text;
}

function optionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`clicktrail: ${field} must be a positive finite number.`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`clicktrail: ${field} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function pickDefined(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface TrackEventInput {
  eventName: unknown;
  data?: unknown;
}

export function buildTrackEvent(input: TrackEventInput): BuilderResult {
  const eventName = requireNonEmptyString(input.eventName, 'eventName');
  const data = requireRecord(input.data, 'data');
  return { eventName, data };
}

export interface IdentifyLeadInput {
  visitorId?: unknown;
  email?: unknown;
  leadId?: unknown;
  name?: unknown;
}

export function buildIdentifyLead(input: IdentifyLeadInput): BuilderResult {
  const data = pickDefined({
    visitor_id: optionalString(input.visitorId, 'visitorId'),
    email: optionalString(input.email, 'email'),
    lead_id: optionalString(input.leadId, 'leadId'),
    name: optionalString(input.name, 'name'),
  });
  return { eventName: ACTION_EVENT_NAMES.identifyLead, data };
}

export interface AttachAttributionInput {
  visitorId?: unknown;
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
}

export function buildAttachAttribution(input: AttachAttributionInput): BuilderResult {
  const data = pickDefined({
    visitor_id: optionalString(input.visitorId, 'visitorId'),
    source: optionalString(input.source, 'source'),
    medium: optionalString(input.medium, 'medium'),
    campaign: optionalString(input.campaign, 'campaign'),
  });
  return { eventName: ACTION_EVENT_NAMES.attachAttribution, data };
}

export interface RecordBookingInput {
  value?: unknown;
  currency?: unknown;
  startDate?: unknown;
}

export function buildRecordBooking(input: RecordBookingInput): BuilderResult {
  const data = pickDefined({
    value: optionalPositiveNumber(input.value, 'booking.value'),
    currency: optionalString(input.currency, 'booking.currency'),
    start_date: optionalString(input.startDate, 'booking.startDate'),
  });
  return { eventName: ACTION_EVENT_NAMES.recordBooking, data };
}

export interface QualifiedLeadInput {
  leadId: unknown;
}

export function buildQualifiedLead(input: QualifiedLeadInput): BuilderResult {
  const leadId = requireNonEmptyString(input.leadId, 'leadId');
  return { eventName: ACTION_EVENT_NAMES.recordQualifiedLead, data: { lead_id: leadId } };
}

export interface RecordSaleInput {
  transactionId: unknown;
  value: unknown;
  currency: unknown;
}

export function buildRecordSale(input: RecordSaleInput): BuilderResult {
  const data = {
    transaction_id: requireNonEmptyString(input.transactionId, 'transactionId'),
    value: requirePositiveNumber(input.value, 'value'),
    currency: requireNonEmptyString(input.currency, 'currency'),
  };
  return { eventName: ACTION_EVENT_NAMES.recordSale, data };
}

function requirePositiveNumber(value: unknown, field: string): number {
  const resolved = optionalPositiveNumber(value, field);
  if (resolved === undefined) {
    throw new TypeError(`clicktrail: ${field} must be a positive finite number.`);
  }
  return resolved;
}

export interface RecordRefundInput {
  originalTransactionId: unknown;
  value?: unknown;
}

export function buildRecordRefund(input: RecordRefundInput): BuilderResult {
  const originalTransactionId = requireNonEmptyString(
    input.originalTransactionId,
    'originalTransactionId',
  );
  const data = pickDefined({
    original_transaction_id: originalTransactionId,
    value: optionalPositiveNumber(input.value, 'refund.value'),
  });
  return { eventName: ACTION_EVENT_NAMES.recordRefund, data };
}

export interface UpdateConsentInput {
  state: unknown;
  source?: unknown;
  policyVersion?: unknown;
}

export function resolveConsentEventName(state: unknown): ConsentEventName {
  const name = requireNonEmptyString(state, 'state');
  if (!(CONSENT_EVENT_NAMES as readonly string[]).includes(name)) {
    throw new TypeError(
      `clicktrail: state must be one of ${CONSENT_EVENT_NAMES.join(', ')}.`,
    );
  }
  return name as ConsentEventName;
}

export function buildUpdateConsent(input: UpdateConsentInput): BuilderResult {
  const legacyName = resolveConsentEventName(input.state);
  const data = pickDefined({
    consent_state: legacyName.slice('consent.'.length),
    consent_source: optionalString(input.source, 'consent.source'),
    consent_version: optionalString(input.policyVersion, 'consent.policyVersion'),
  });
  return { eventName: 'consent_updated', data };
}

/**
 * Consent flags folded into the marketing_trail envelope. `policy_updated`
 * carries no state change, so no consent object is attached.
 */
export function consentContextFor(state: unknown): MarketingTrailContext['consent'] {
  if (state === 'granted') {
    return { analytics: true, advertising: true };
  }
  if (state === 'withdrawn') {
    return { analytics: false, advertising: false };
  }
  return undefined;
}

export interface ActionEventContext {
  siteId: string;
  workspaceId?: string;
}

/**
 * Stamp one builder result through the common SDK layer into a
 * schema/classifier-stamped event with the marketing_trail envelope.
 * Attribution logic lives entirely in @vizuh/clicktrail — this wrapper adds none.
 */
export function buildActionEvent(
  result: BuilderResult,
  context: ActionEventContext,
): ClickTrailEvent {
  const envelopeContext: MarketingTrailContext = {
    siteId: context.siteId,
    ...(context.workspaceId !== undefined ? { workspaceId: context.workspaceId } : {}),
  };
  const consent = consentContextFor(result.data['consent_state']);
  return buildEventPayload({}, toCanonicalEventName(result.eventName), result.data, {
    ...envelopeContext,
    ...(consent !== undefined ? { consent } : {}),
  });
}
