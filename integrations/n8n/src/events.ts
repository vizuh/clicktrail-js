/**
 * Pure operation -> ClickTrail event builders for the n8n ClickTrail node.
 *
 * Zero n8n-runtime imports: every builder is an async function testable
 * outside the node. Validation mirrors the @vizuh/clicktrail-astro server
 * contracts (`ClickTrailServer.trackLead/trackBooking/trackPurchase`):
 * money ops require positive finite value + non-empty currency, id fields
 * require non-empty strings, and every failure is a rejected promise
 * (TypeError) instead of a synchronous throw. Unknown fields pass through
 * as extra event data.
 *
 * Every builder returns a `buildEventPayload(...)` product carrying the
 * schema/classifier stamps and the `marketing_trail` envelope.
 */
import { buildEventPayload } from '@vizuh/clicktrail/browser';
import type { AttributionPayload } from '@vizuh/clicktrail';
import type { ClickTrailEvent, MarketingTrailContext } from '@vizuh/clicktrail/browser';
import { toCanonicalEventName } from '@vizuh/clicktrail-core';

/** siteId / workspaceId / consent / identity context for the envelope. */
export type BuilderContext = MarketingTrailContext;

export interface OperationDef {
  /** Canonical ClickTrail event name emitted by this operation. */
  readonly eventName: string;
  /** Pure builder: validates input, returns one stamped event or rejects. */
  readonly builder: (
    input: Record<string, unknown>,
    context?: BuilderContext,
  ) => Promise<ClickTrailEvent>;
}

export const RESOURCES = ['lead', 'conversion', 'consent'] as const;
export type ResourceName = (typeof RESOURCES)[number];

// ---------------------------------------------------------------------------
// validation helpers (mirror packages/astro/src/server.ts contracts)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`clicktrail: ${field} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireNonEmptyString(value, field);
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`clicktrail: ${field} must be a positive finite number.`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requirePositiveNumber(value, field);
}

/**
 * Negative-safe finite number: refunds may legitimately be recorded as a
 * negative delta, so any finite number is accepted when present.
 */
function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`clicktrail: ${field} must be a finite number.`);
  }
  return value;
}

/** Merge caller extras (unknown fields pass through as extra data). */
function extras(input: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!known.includes(key) && value !== undefined && value !== null && value !== '') {
      rest[key] = value;
    }
  }
  return rest;
}

async function build(
  eventName: string,
  payload: AttributionPayload,
  data: Record<string, unknown>,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  return buildEventPayload(payload, toCanonicalEventName(eventName), data, context);
}

// ---------------------------------------------------------------------------
// LEAD resource
// ---------------------------------------------------------------------------

export interface CreateOrIdentifyInput extends Record<string, unknown> {
  visitorId?: string;
  email?: string;
  leadId?: string;
  name?: string;
}

/** 'lead' — create or identify a lead; attaches the full trail when an attribution payload is supplied via `attributionPayloadJson`. */
export async function buildLeadCreateOrIdentify(
  input: CreateOrIdentifyInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const payload: AttributionPayload =
    typeof input.attributionPayloadJson === 'string' && input.attributionPayloadJson.trim() !== ''
      ? parseAttributionPayload(input.attributionPayloadJson)
      : {};
  const data = {
    ...(optionalNonEmptyString(input.visitorId, 'visitorId') !== undefined
      ? { visitor_id: optionalNonEmptyString(input.visitorId, 'visitorId') }
      : {}),
    email: optionalNonEmptyString(input.email, 'email'),
    lead_id: optionalNonEmptyString(input.leadId, 'leadId'),
    name: optionalNonEmptyString(input.name, 'name'),
    ...extras(input, ['visitorId', 'email', 'leadId', 'name', 'attributionPayloadJson']),
  };
  const visitorId = optionalNonEmptyString(input.visitorId, 'visitorId');
  const resolvedVisitor = visitorId ?? context?.identity?.visitorId;
  const mergedContext: BuilderContext = { ...context };
  if (resolvedVisitor !== undefined) mergedContext.identity = { visitorId: resolvedVisitor };
  return build('lead_created', payload, data, mergedContext);
}

export interface AttachAttributionInput extends Record<string, unknown> {
  /** JSON string of a canonical flat AttributionPayload (ft_/lt_ keys). */
  attributionPayloadJson?: string;
  /** Flat ft_/lt_ key-value collection; merged over the parsed JSON payload. */
  flatAttribution?: Record<string, unknown>;
}

function parseAttributionPayload(raw: string): AttributionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError('clicktrail: attributionPayloadJson must be valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new TypeError('clicktrail: attributionPayloadJson must decode to a flat object.');
  }
  return parsed as AttributionPayload;
}

/** 'lead_created' — attach a trail to an existing lead. */
export async function buildAttachAttribution(
  input: AttachAttributionInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  let payload: AttributionPayload = {};
  if (typeof input.attributionPayloadJson === 'string' && input.attributionPayloadJson.trim() !== '') {
    payload = parseAttributionPayload(input.attributionPayloadJson);
  }
  const merged: AttributionPayload = { ...payload, ...(input.flatAttribution as AttributionPayload) };
  if (Object.keys(merged).length === 0) {
    throw new TypeError('clicktrail: provide attributionPayloadJson or a flatAttribution collection.');
  }
  const data = extras(input, ['attributionPayloadJson', 'flatAttribution']);
  return build('lead_created', merged, data, context);
}

export interface UpdateStageInput extends Record<string, unknown> {
  stage: string;
  leadId?: string;
}

/** 'lead.stage_updated' — move a lead through its pipeline stage. */
export async function buildUpdateStage(
  input: UpdateStageInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    stage: requireNonEmptyString(input.stage, 'stage'),
    lead_id: optionalNonEmptyString(input.leadId, 'leadId'),
    ...extras(input, ['stage', 'leadId']),
  };
  return build('lead_updated', {}, data, context);
}

export interface MarkQualifiedInput extends Record<string, unknown> {
  leadId: string;
}

/** 'lead.qualified' — flag a lead as qualified. */
export async function buildMarkQualified(
  input: MarkQualifiedInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    lead_id: requireNonEmptyString(input.leadId, 'leadId'),
    ...extras(input, ['leadId']),
  };
  return build('lead_qualified', {}, data, context);
}

export interface MergeVisitorInput extends Record<string, unknown> {
  anonymousVisitorId: string;
  knownContactId: string;
}

/** 'lead.merged' — merge an anonymous visitor into a known contact. */
export async function buildMergeVisitor(
  input: MergeVisitorInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    anonymous_visitor_id: requireNonEmptyString(input.anonymousVisitorId, 'anonymousVisitorId'),
    known_contact_id: requireNonEmptyString(input.knownContactId, 'knownContactId'),
    ...extras(input, ['anonymousVisitorId', 'knownContactId']),
  };
  return build('lead_merged', {}, data, context);
}

// ---------------------------------------------------------------------------
// CONVERSION resource
// ---------------------------------------------------------------------------

export interface AppointmentInput extends Record<string, unknown> {
  bookingId?: string;
  value?: number;
  currency?: string;
  startDate?: string;
}

/** 'booking_created' — a booked appointment. Money fields are validated when present. */
export async function buildRecordAppointment(
  input: AppointmentInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    booking_id: optionalNonEmptyString(input.bookingId, 'bookingId'),
    value: optionalPositiveNumber(input.value, 'value'),
    currency: optionalNonEmptyString(input.currency, 'currency'),
    start_date: optionalNonEmptyString(input.startDate, 'startDate'),
    ...extras(input, ['bookingId', 'value', 'currency', 'startDate']),
  };
  return build('booking_created', {}, data, context);
}

export interface CompletedAppointmentInput extends Record<string, unknown> {
  bookingId?: string;
}

/** 'booking_completed' — an appointment that actually happened. */
export async function buildRecordCompletedAppointment(
  input: CompletedAppointmentInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    booking_id: optionalNonEmptyString(input.bookingId, 'bookingId'),
    ...extras(input, ['bookingId']),
  };
  return build('booking_completed', {}, data, context);
}

export interface SaleInput extends Record<string, unknown> {
  transactionId: string;
  value: number;
  currency: string;
}

/** 'sale' — a closed-won purchase. transactionId/value/currency required. */
export async function buildRecordSale(
  input: SaleInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    transaction_id: requireNonEmptyString(input.transactionId, 'transactionId'),
    value: requirePositiveNumber(input.value, 'value'),
    currency: requireNonEmptyString(input.currency, 'currency'),
    ...extras(input, ['transactionId', 'value', 'currency']),
  };
  return build('sale', {}, data, context);
}

export interface RecurringRevenueInput extends Record<string, unknown> {
  subscriptionId: string;
  value: number;
  currency: string;
  interval?: string;
}

/** 'sale' — subscription revenue recognition. */
export async function buildRecordRecurringRevenue(
  input: RecurringRevenueInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    subscription_id: requireNonEmptyString(input.subscriptionId, 'subscriptionId'),
    value: requirePositiveNumber(input.value, 'value'),
    currency: requireNonEmptyString(input.currency, 'currency'),
    interval: optionalNonEmptyString(input.interval, 'interval'),
    ...extras(input, ['subscriptionId', 'value', 'currency', 'interval']),
  };
  return build('sale', {}, data, context);
}

export interface RefundInput extends Record<string, unknown> {
  originalTransactionId: string;
  value?: number;
}

/** 'refund' — refund against an original sale; negative-safe value. */
export async function buildRecordRefund(
  input: RefundInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    original_transaction_id: requireNonEmptyString(input.originalTransactionId, 'originalTransactionId'),
    value: optionalFiniteNumber(input.value, 'value'),
    ...extras(input, ['originalTransactionId', 'value']),
  };
  return build('refund', {}, data, context);
}

export interface OfflineConversionInput extends Record<string, unknown> {
  clickId?: string;
  trailId?: string;
  conversionName: string;
  value?: number;
  currency?: string;
}

/** 'sale' — GCLID-style offline conversion upload. clickId OR trailId required. */
export async function buildSendOfflineConversion(
  input: OfflineConversionInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const clickId = optionalNonEmptyString(input.clickId, 'clickId');
  const trailId = optionalNonEmptyString(input.trailId, 'trailId');
  if (!clickId && !trailId) {
    throw new TypeError('clicktrail: offline conversion requires clickId or trailId.');
  }
  const data = {
    conversion_name: requireNonEmptyString(input.conversionName, 'conversionName'),
    ...(clickId !== undefined ? { click_id: clickId } : {}),
    ...(trailId !== undefined ? { trail_id: trailId } : {}),
    value: optionalPositiveNumber(input.value, 'value'),
    currency: optionalNonEmptyString(input.currency, 'currency'),
    ...extras(input, ['clickId', 'trailId', 'conversionName', 'value', 'currency']),
  };
  return build('sale', {}, data, context);
}

// ---------------------------------------------------------------------------
// CONSENT resource
// ---------------------------------------------------------------------------

export type ConsentState = 'granted' | 'denied' | 'withdrawn';
const CONSENT_STATES: readonly ConsentState[] = ['granted', 'denied', 'withdrawn'];

export interface RecordConsentInput extends Record<string, unknown> {
  state: ConsentState;
  source?: string;
  policyVersion?: string;
}

/** 'consent_updated' — record a consent decision. */
export async function buildRecordConsent(
  input: RecordConsentInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const state = requireNonEmptyString(input.state, 'state');
  if (!(CONSENT_STATES as readonly string[]).includes(state)) {
    throw new TypeError(`clicktrail: state must be one of ${CONSENT_STATES.join(', ')}.`);
  }
  const data = {
    state,
    source: optionalNonEmptyString(input.source, 'source'),
    policy_version: optionalNonEmptyString(input.policyVersion, 'policyVersion'),
    ...extras(input, ['state', 'source', 'policyVersion']),
  };
  return build('consent_updated', {}, data, context);
}

export interface WithdrawConsentInput extends Record<string, unknown> {
  source?: string;
  policyVersion?: string;
}

/** 'consent_updated' — record a consent withdrawal. */
export async function buildRecordWithdrawal(
  input: WithdrawConsentInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    source: optionalNonEmptyString(input.source, 'source'),
    policy_version: optionalNonEmptyString(input.policyVersion, 'policyVersion'),
    ...extras(input, ['source', 'policyVersion']),
  };
  return build('consent_updated', {}, data, context);
}

export interface UpdateConsentPolicyInput extends Record<string, unknown> {
  source: string;
  policyVersion: string;
}

/** 'consent_updated' — announce a new consent policy version. */
export async function buildUpdateConsentPolicy(
  input: UpdateConsentPolicyInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const data = {
    source: requireNonEmptyString(input.source, 'source'),
    policy_version: requireNonEmptyString(input.policyVersion, 'policyVersion'),
    ...extras(input, ['source', 'policyVersion']),
  };
  return build('consent_updated', {}, data, context);
}

export interface AnonymizeVisitorInput extends Record<string, unknown> {
  visitorId: string;
}

/**
 * 'visitor_anonymized' — emits a deletion REQUEST event. Actual erasure
 * depends on collector support; this operation never deletes anything by
 * itself.
 */
export async function buildAnonymizeVisitor(
  input: AnonymizeVisitorInput,
  context?: BuilderContext,
): Promise<ClickTrailEvent> {
  const visitorId = requireNonEmptyString(input.visitorId, 'visitorId');
  const data = {
    visitor_id: visitorId,
    ...extras(input, ['visitorId']),
  };
  return build('visitor_anonymized', {}, { ...data }, { ...context, identity: { visitorId } });
}

// ---------------------------------------------------------------------------
// routing table (pure data — asserted by tests/node-routing.test.ts)
// ---------------------------------------------------------------------------

/**
 * Wrap a typed builder into the uniform OperationDef shape. The `never`
 * parameter makes any builder assignable; the runtime cast is safe because
 * the node assembles inputs from the declared field list of that operation.
 */
function op(
  eventName: string,
  builder: (input: never, context?: BuilderContext) => Promise<ClickTrailEvent>,
): OperationDef {
  return {
    eventName,
    builder: (input: Record<string, unknown>, context?: BuilderContext) => builder(input as never, context),
  };
}

export const OPERATIONS: Readonly<Record<ResourceName, Readonly<Record<string, OperationDef>>>> = Object.freeze({
  lead: Object.freeze({
    createOrIdentify: op('lead_created', buildLeadCreateOrIdentify),
    attachAttribution: op('lead_created', buildAttachAttribution),
    updateStage: op('lead_updated', buildUpdateStage),
    markQualified: op('lead_qualified', buildMarkQualified),
    mergeVisitor: op('lead_merged', buildMergeVisitor),
  }),
  conversion: Object.freeze({
    recordAppointment: op('booking_created', buildRecordAppointment),
    recordCompletedAppointment: op('booking_completed', buildRecordCompletedAppointment),
    recordSale: op('sale', buildRecordSale),
    recordRecurringRevenue: op('sale', buildRecordRecurringRevenue),
    recordRefund: op('refund', buildRecordRefund),
    sendOfflineConversion: op('sale', buildSendOfflineConversion),
  }),
  consent: Object.freeze({
    recordConsent: op('consent_updated', buildRecordConsent),
    recordWithdrawal: op('consent_updated', buildRecordWithdrawal),
    updateConsentPolicy: op('consent_updated', buildUpdateConsentPolicy),
    anonymizeVisitor: op('visitor_anonymized', buildAnonymizeVisitor),
  }),
});
