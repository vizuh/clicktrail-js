import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildGa4MeasurementProtocolEvent,
  type Ga4MeasurementProtocolInput,
  type Ga4MeasurementProtocolResult,
} from '../src/index.js';

interface Ga4Case {
  name: string;
  description: string;
  quirk_decision: string;
  input: Record<string, unknown>;
  expected: Ga4MeasurementProtocolResult;
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/ga4-measurement-protocol.json', import.meta.url), 'utf8'),
) as { base_input: Record<string, unknown>; cases: Ga4Case[] };

function caseInput(overrides: Record<string, unknown>): Ga4MeasurementProtocolInput {
  return { ...fixture.base_input, ...overrides } as unknown as Ga4MeasurementProtocolInput;
}

const base = caseInput({});

describe('buildGa4MeasurementProtocolEvent fixtures', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(buildGa4MeasurementProtocolEvent(caseInput(c.input))).toEqual(c.expected);
  });

  it('covers every skip reason and timestamp source', () => {
    const outcomes = new Set(
      fixture.cases.map((c) => ('skip' in c.expected ? c.expected.skip : c.expected.timestampSource)),
    );
    expect([...outcomes].sort()).toEqual([
      'checkout_start_plus_1s',
      'event_time',
      'invalid_client_id',
      'invalid_session_id',
      'missing_client_id',
      'missing_session_id',
      'paid_before_checkout',
      'too_late',
    ]);
  });
});

describe('buildGa4MeasurementProtocolEvent invariants', () => {
  it('emits session_id as a number and engagement_time_msec >= 1', () => {
    const result = buildGa4MeasurementProtocolEvent(base);
    if (!('payload' in result)) throw new Error('expected payload');
    const params = result.payload.events[0].params;
    expect(typeof params.session_id).toBe('number');
    expect(params.engagement_time_msec).toBeGreaterThanOrEqual(1);
  });

  it('is pure: same input, same output, input untouched', () => {
    const input = caseInput({ items: [{ item_id: 'sku_synthetic', quantity: 2 }] });
    const before = JSON.stringify(input);
    expect(buildGa4MeasurementProtocolEvent(input)).toEqual(buildGa4MeasurementProtocolEvent(input));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('normalizes currency case and accepts value 0', () => {
    const result = buildGa4MeasurementProtocolEvent(caseInput({ currency: 'brl', value: 0 }));
    if (!('payload' in result)) throw new Error('expected payload');
    expect(result.payload.events[0].params).toMatchObject({ currency: 'BRL', value: 0 });
  });
});

describe('buildGa4MeasurementProtocolEvent input validation', () => {
  it.each([
    ['missing consent', { consent: undefined }],
    ['hard-coded consent shape', { consent: { ad_user_data: 'GRANTED', ad_personalization: 'granted' } }],
    ['unknown consent value', { consent: { ad_user_data: 'granted', ad_personalization: 'unknown' } }],
    ['empty transactionId', { transactionId: ' ' }],
    ['transactionId over 100 characters', { transactionId: 'x'.repeat(101) }],
    ['negative value', { value: -1 }],
    ['non-finite value', { value: Number.NaN }],
    ['invalid currency', { currency: 'REAL' }],
    ['invalid now', { now: 'yesterday' }],
    ['invalid checkoutStartedAt', { checkoutStartedAt: 1792584300 }],
    ['invalid paidAt', { paidAt: '' }],
    ['session timeout below GA4 range', { sessionTimeoutMinutes: 4 }],
    ['session timeout above GA4 range', { sessionTimeoutMinutes: 476 }],
    ['item without id or name', { items: [{ price: 1 }] }],
    ['item with fractional quantity', { items: [{ item_id: 'a', quantity: 1.5 }] }],
    ['unknown event', { event: 'begin_checkout' }],
  ])('throws TypeError for %s', (_name, overrides) => {
    expect(() => buildGa4MeasurementProtocolEvent(caseInput(overrides))).toThrow(TypeError);
  });

  it('requires refundedAt for refunds', () => {
    expect(() => buildGa4MeasurementProtocolEvent(caseInput({ event: 'refund' }))).toThrow(TypeError);
  });
});
