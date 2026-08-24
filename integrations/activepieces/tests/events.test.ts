import { describe, expect, it } from 'vitest';
import {
  ACTION_EVENT_NAMES,
  buildActionEvent,
  buildAttachAttribution,
  buildIdentifyLead,
  buildQualifiedLead,
  buildRecordBooking,
  buildRecordRefund,
  buildRecordSale,
  buildTrackEvent,
  buildUpdateConsent,
  consentContextFor,
} from '../src/lib/events.js';
import type { BuilderResult } from '../src/lib/events.js';

const CONTEXT = { siteId: 'site-1', workspaceId: 'ws-9' };

function expectNoThrow(fn: () => BuilderResult): BuilderResult {
  let result!: BuilderResult;
  expect(() => {
    result = fn();
  }).not.toThrow();
  return result;
}

describe('builder happy paths', () => {
  it('Identify Lead -> "lead" with snake_case identity fields', () => {
    const r = expectNoThrow(() =>
      buildIdentifyLead({ visitorId: 'v-1', email: 'a@b.co', leadId: 'L-1', name: 'Ana' }),
    );
    expect(r.eventName).toBe(ACTION_EVENT_NAMES.identifyLead);
    expect(r.data).toEqual({
      visitor_id: 'v-1',
      email: 'a@b.co',
      lead_id: 'L-1',
      name: 'Ana',
    });
  });

  it('Identify Lead omits unset optional fields', () => {
    const r = buildIdentifyLead({});
    expect(r.data).toEqual({});
  });

  it('Attach Attribution -> "lead.attribution_attached"', () => {
    const r = buildAttachAttribution({
      visitorId: 'v-2',
      source: 'google',
      medium: 'cpc',
      campaign: 'spring',
    });
    expect(r.eventName).toBe('lead_created');
    expect(r.data['source']).toBe('google');
    expect(r.data['campaign']).toBe('spring');
  });

  it('Record Booking -> "booking" with value/currency/start_date', () => {
    const r = buildRecordBooking({ value: 120.5, currency: 'EUR', startDate: '2026-09-01' });
    expect(r.eventName).toBe('booking');
    expect(r.data).toEqual({ value: 120.5, currency: 'EUR', start_date: '2026-09-01' });
  });

  it('Record Qualified Lead -> "lead.qualified" with required lead_id', () => {
    const r = buildQualifiedLead({ leadId: 'lead_9' });
    expect(r.eventName).toBe('lead_qualified');
    expect(r.data).toEqual({ lead_id: 'lead_9' });
  });

  it('Record Sale -> "sale.recorded" with transaction/value/currency', () => {
    const r = buildRecordSale({ transactionId: 'T-77', value: 250, currency: 'USD' });
    expect(r.eventName).toBe('sale');
    expect(r.data).toEqual({ transaction_id: 'T-77', value: 250, currency: 'USD' });
  });

  it('Record Refund -> "refund.issued" with original_transaction_id', () => {
    const r = buildRecordRefund({ originalTransactionId: 'T-77', value: 50 });
    expect(r.eventName).toBe('refund');
    expect(r.data).toEqual({ original_transaction_id: 'T-77', value: 50 });
  });

  it('Update Consent dropdown state drives the three event names', () => {
    expect(buildUpdateConsent({ state: 'consent_updated' }).eventName).toBe('consent_updated');
    expect(buildUpdateConsent({ state: 'consent_updated' }).eventName).toBe('consent_updated');
    expect(
      buildUpdateConsent({ state: 'consent_updated', policyVersion: '2026-01' }).data,
    ).toEqual({ policy_version: '2026-01' });
  });

  it('Track Event passes a free-string event name plus JSON object through', () => {
    const r = buildTrackEvent({ eventName: 'video.watched', data: { seconds: 42 } });
    expect(r.eventName).toBe('video.watched');
    expect(r.data).toEqual({ seconds: 42 });
  });
});

describe('required-field rejection matrix', () => {
  it('rejects Track Event without an event name', () => {
    expect(() => buildTrackEvent({ eventName: '' })).toThrow(TypeError);
    expect(() => buildTrackEvent({ eventName: '   ' })).toThrow(/eventName/);
  });

  it('rejects Track Event with non-object JSON data', () => {
    expect(() => buildTrackEvent({ eventName: 'x', data: [1, 2] })).toThrow(/JSON object/);
  });

  it('rejects Record Sale missing any of transactionId / value / currency', () => {
    expect(() => buildRecordSale({ transactionId: '', value: 1, currency: 'EUR' })).toThrow(/transactionId/);
    expect(() => buildRecordSale({ transactionId: 'T', value: 0, currency: 'EUR' })).toThrow(/value/);
    expect(() => buildRecordSale({ transactionId: 'T', value: 1, currency: ' ' })).toThrow(/currency/);
  });

  it('rejects Record Qualified Lead without leadId', () => {
    expect(() => buildQualifiedLead({ leadId: undefined })).toThrow(/leadId/);
  });

  it('rejects Record Refund without originalTransactionId', () => {
    expect(() => buildRecordRefund({ originalTransactionId: null })).toThrow(/originalTransactionId/);
  });

  it('rejects non-positive booking values', () => {
    expect(() => buildRecordBooking({ value: -5 })).toThrow(/positive finite number/);
    expect(() => buildRecordBooking({ value: Number.NaN })).toThrow(TypeError);
  });

  it('rejects unknown consent states', () => {
    expect(() => buildUpdateConsent({ state: 'consent.maybe' })).toThrow(/state must be one of/);
  });
});

describe('buildActionEvent stamps + envelope', () => {
  it('stamps schema/classifier versions and preserves event_name', () => {
    const event = buildActionEvent(buildRecordSale({ transactionId: 'T-1', value: 9, currency: 'EUR' }), CONTEXT);
    expect(typeof event.schema_version).toBe('string');
    expect(event.schema_version.length).toBeGreaterThan(0);
    expect(typeof event.classifier_version).toBe('string');
    expect(event.classifier_version.length).toBeGreaterThan(0);
    expect(event.event_name).toBe('sale');
    expect(event.transaction_id).toBe('T-1');
  });

  it('carries site_id and workspace_id into marketing_trail', () => {
    const event = buildActionEvent(buildQualifiedLead({ leadId: 'L' }), CONTEXT);
    expect(event.marketing_trail.site_id).toBe('site-1');
    expect(event.marketing_trail.workspace_id).toBe('ws-9');
    expect(event.marketing_trail.lead_id.startsWith('lead_')).toBe(true);
  });

  it('derives trail/anonymous ids from a supplied visitor id', () => {
    const event = buildActionEvent(
      buildTrackEvent({ eventName: 'custom.thing', data: { visitor_id: 'v-9' } }),
      CONTEXT,
    );
    expect(event.event_name).toBe('custom.thing');
    expect(event.marketing_trail.anonymous_id).toBe('anon_v-9');
    expect(event.marketing_trail.trail_id).toBe('trl_v-9');
  });

  it('folds granted/withdrawn consent into the envelope, leaves policy_updated alone', () => {
    const granted = buildActionEvent(buildUpdateConsent({ state: 'consent_updated' }), CONTEXT);
    expect(granted.marketing_trail.consent.analytics).toBe(true);
    expect(granted.marketing_trail.consent.advertising).toBe(true);

    const withdrawn = buildActionEvent(buildUpdateConsent({ state: 'consent_updated' }), CONTEXT);
    expect(withdrawn.marketing_trail.consent.analytics).toBe(false);

    const updated = buildActionEvent(buildUpdateConsent({ state: 'consent_updated' }), CONTEXT);
    // No state change implied: default consent flags resolve to false.
    expect(updated.event_name).toBe('consent_updated');
    expect(consentContextFor(updated.event_name)).toBeUndefined();
  });

  it('does not stamp consent context onto money/id events', () => {
    const event = buildActionEvent(buildRecordBooking({ value: 5 }), CONTEXT);
    expect(consentContextFor(event.event_name)).toBeUndefined();
  });
});
