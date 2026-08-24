/**
 * buildOutcomeEvent: pure builder validation. No clock, no randomness,
 * no network — deterministic inputs, deterministic output.
 */
import { describe, expect, it } from 'vitest';
import {
  APOINTOO_OUTCOME_EVENTS,
  ATTR_OUTCOME_ID,
  WIRE_JOURNEY_ID,
  buildOutcomeEvent,
  isOutcomeEvent,
} from '../src/apointoo/outcome.js';
import { EVENT_SALE_COMPLETED } from '@vizuh/clicktrail-core';

describe('buildOutcomeEvent', () => {
  it('rejects event names outside the outcome set', () => {
    expect(() => buildOutcomeEvent('page_view', { journeyId: 'j1' })).toThrow(/unknown outcome event/);
    expect(() => buildOutcomeEvent('', { journeyId: 'j1' })).toThrow();
    for (const name of APOINTOO_OUTCOME_EVENTS) {
      expect(isOutcomeEvent(name)).toBe(true);
    }
    expect(isOutcomeEvent('not.an.event')).toBe(false);
  });

  it('requires a non-empty journeyId', () => {
    expect(() => buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: '' })).toThrow(/journeyId/);
    expect(() =>
      buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: undefined as unknown as string }),
    ).toThrow(/journeyId/);
  });

  it('requires currency when value is present', () => {
    expect(() =>
      buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: 'j1', value: 100 }),
    ).toThrow(/currency/);
    expect(() =>
      buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: 'j1', value: 100, currency: '' }),
    ).toThrow(/currency/);
    const ok = buildOutcomeEvent(EVENT_SALE_COMPLETED, {
      journeyId: 'j1',
      value: 99.5,
      currency: 'EUR',
      outcomeId: 'ord_1',
    });
    expect(ok['value']).toBe(99.5);
    expect(ok['currency']).toBe('EUR');
    expect(ok[ATTR_OUTCOME_ID]).toBe('ord_1');
  });

  it('rejects non-finite values', () => {
    expect(() =>
      buildOutcomeEvent(EVENT_SALE_COMPLETED, {
        journeyId: 'j1',
        value: Number.NaN,
        currency: 'EUR',
      }),
    ).toThrow(/finite/);
    expect(() =>
      buildOutcomeEvent(EVENT_SALE_COMPLETED, {
        journeyId: 'j1',
        value: Infinity,
        currency: 'EUR',
      }),
    ).toThrow(/finite/);
  });

  it('emits deterministic field order regardless of ctx insertion order', () => {
    const a = buildOutcomeEvent(
      EVENT_SALE_COMPLETED,
      { journeyId: 'j1', value: 10, currency: 'EUR' },
      { ft_source: 'google', ft_medium: 'cpc', visitor_id: 'v1', gclid: 'g1' },
    );
    const b = buildOutcomeEvent(
      EVENT_SALE_COMPLETED,
      { journeyId: 'j1', value: 10, currency: 'EUR' },
      { gclid: 'g1', visitor_id: 'v1', ft_medium: 'cpc', ft_source: 'google' },
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const keys = Object.keys(a);
    expect(keys.indexOf('event_name')).toBeLessThan(keys.indexOf(WIRE_JOURNEY_ID));
    // Version stamps land last.
    expect(keys[keys.length - 2]).toBe('schema_version');
    expect(keys[keys.length - 1]).toBe('classifier_version');
  });

  it('strips unknown ctx keys (payload minimization at the builder)', () => {
    const rec = buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: 'j1' }, {
      ft_source: 'google',
      email: 'hacker@example.com',
      password_hash: 'x',
      internal_note: 'secret',
    });
    expect(rec['ft_source']).toBe('google');
    expect('email' in rec).toBe(false);
    expect('password_hash' in rec).toBe(false);
    expect('internal_note' in rec).toBe(false);
  });
});
