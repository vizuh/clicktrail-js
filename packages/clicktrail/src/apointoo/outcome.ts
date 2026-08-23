/**
 * Pure outcome-event builder for the Apointoo commercial loop.
 *
 * Verified outcomes (appointments/sales) flow back to Apointoo carrying the
 * original journey attribution. This file is DETERMINISTIC and side-effect
 * free: no clock, no randomness, no network — everything enters as arguments.
 *
 * PAYLOAD MINIMIZATION LAW: only allowlisted fields ever leave the browser
 * (journey/outcome ids, value/currency stamps, canonical ft_/lt_ attribution
 * keys). Unknown extra keys are STRIPPED, never forwarded.
 */
import { stampVersions } from '../core/merge.js';
import { CANONICAL_PAYLOAD_KEYS } from '../browser/payload-store.js';
import {
  EVENT_APPOINTMENT_ATTENDED,
  EVENT_APPOINTMENT_BOOKED,
  EVENT_LEAD_SUBMITTED,
  EVENT_SALE_COMPLETED,
  EVENT_SALE_REFUNDED,
} from '../conventions/stable.js';
import { EVENT_LEAD_QUALIFIED } from '../conventions/incubating.js';

/** Journey correlation key on the wire (incubating convention ATTR_JOURNEY_ID). */
export const WIRE_JOURNEY_ID = 'journey.id' as const;

/** Outcome-correlation key assigned by the host (e.g. order/appointment id). */
export const ATTR_OUTCOME_ID = 'outcome.id' as const;

/** Outcome event names accepted by the /apointoo subpath. */
export const APOINTOO_OUTCOME_EVENTS: readonly string[] = [
  EVENT_LEAD_SUBMITTED,
  EVENT_LEAD_QUALIFIED,
  EVENT_APPOINTMENT_BOOKED,
  EVENT_APPOINTMENT_ATTENDED,
  EVENT_SALE_COMPLETED,
  EVENT_SALE_REFUNDED,
];

const OUTCOME_EVENT_SET: ReadonlySet<string> = new Set(APOINTOO_OUTCOME_EVENTS);

/** True when `name` is an outcome event this destination delivers. */
export function isOutcomeEvent(name: unknown): name is string {
  return typeof name === 'string' && OUTCOME_EVENT_SET.has(name);
}

/**
 * Allowlist of keys that may leave the browser on an outcome payload:
 * canonical attribution fields (ft_/lt_ touches, click ids, browser ids,
 * visitor/session) in their fixed canonical order. Anything not listed here
 * is stripped before serialization.
 */
export const OUTCOME_ALLOWED_KEYS: readonly string[] = CANONICAL_PAYLOAD_KEYS;

/** Inputs to {@link buildOutcomeEvent}. */
export interface OutcomeInput {
  /** Durable journey identifier. Required. */
  journeyId: string;
  /** Monetary value of the outcome. Requires `currency`. */
  value?: number;
  /** ISO-4217 currency code (e.g. 'EUR'). Required when `value` is present. */
  currency?: string;
  /** Host-assigned outcome id (order id, appointment id, ...). */
  outcomeId?: string;
}

/**
 * A minimized, version-stamped outcome record ready for delivery.
 * Field order is deterministic: event_name, journey.id, outcome.id,
 * value, currency, allowlisted attribution keys (canonical order),
 * then schema/classifier version stamps last.
 */
export type ApointooOutcomeRecord = Record<string, unknown> & {
  event_name: string;
  'journey.id': string;
  schema_version: string;
  classifier_version: string;
};

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`apointoo: '${field}' must be a non-empty string`);
  }
  return value;
}

/**
 * Build one outcome event. Throws on invalid names or missing required
 * fields (fail-closed); never invents values. Deterministic output for
 * deterministic inputs regardless of input object key insertion order.
 */
export function buildOutcomeEvent(
  name: string,
  input: OutcomeInput,
  ctx?: Record<string, unknown>,
): ApointooOutcomeRecord {
  if (!isOutcomeEvent(name)) {
    throw new Error(`apointoo: unknown outcome event '${String(name)}'`);
  }
  const journeyId = requireNonEmptyString(input.journeyId, 'journeyId');

  let value: number | undefined;
  if (input.value !== undefined) {
    if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
      throw new Error("apointoo: 'value' must be a finite number when present");
    }
    value = input.value;
    requireNonEmptyString(input.currency, 'currency');
  }

  const record: Record<string, unknown> = {};
  record.event_name = name;
  record[WIRE_JOURNEY_ID] = journeyId;
  if (input.outcomeId !== undefined) {
    record[ATTR_OUTCOME_ID] = requireNonEmptyString(input.outcomeId, 'outcomeId');
  }
  if (value !== undefined) {
    record['value'] = value;
    record['currency'] = input.currency;
  }
  // Context fills gaps ONLY: explicit builder inputs win over captured ctx.
  // Keys pass through the fixed-order allowlist so serialization is stable.
  const merged = { ...ctx, ...explicitOutcomeKeys(input) };
  for (const key of OUTCOME_ALLOWED_KEYS) {
    if (!(key in record) && key in merged) record[key] = merged[key];
  }
  return stampVersions(record) as ApointooOutcomeRecord;
}

function explicitOutcomeKeys(input: OutcomeInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out[WIRE_JOURNEY_ID] = input.journeyId;
  if (input.outcomeId !== undefined) out[ATTR_OUTCOME_ID] = input.outcomeId;
  if (input.value !== undefined) {
    out['value'] = input.value;
    out['currency'] = input.currency;
  }
  return out;
}

/**
 * Strip an arbitrary delivered record down to the outcome allowlist,
 * preserving the deterministic field order used by {@link buildOutcomeEvent}.
 * Used by the destination on every deliver() so unknown extra keys attached
 * by upstream code never leave the browser. Returns null when the record
 * has no outcome event name.
 */
export function stripToOutcomeRecord(event: Record<string, unknown>): Record<string, unknown> | null {
  const name = event['event_name'];
  if (!isOutcomeEvent(name)) return null;
  const out: Record<string, unknown> = {};
  for (const key of ['event_name', WIRE_JOURNEY_ID, ATTR_OUTCOME_ID, 'value', 'currency']) {
    if (key in event) out[key] = event[key];
  }
  // CANONICAL_PAYLOAD_KEYS is already in its fixed canonical order.
  for (const key of OUTCOME_ALLOWED_KEYS) {
    if (key in event) out[key] = event[key];
  }
  return stampVersions(out);
}
