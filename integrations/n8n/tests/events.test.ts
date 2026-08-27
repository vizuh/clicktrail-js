import { describe, expect, it } from 'vitest';
import {
  buildAnonymizeVisitor,
  buildAttachAttribution,
  buildLeadCreateOrIdentify,
  buildMarkQualified,
  buildMergeVisitor,
  buildRecordAppointment,
  buildRecordCompletedAppointment,
  buildRecordConsent,
  buildRecordRefund,
  buildRecordRecurringRevenue,
  buildRecordSale,
  buildRecordWithdrawal,
  buildSendOfflineConversion,
  buildUpdateConsentPolicy,
  buildUpdateStage,
} from '../src/events.js';

const TRAIL_PAYLOAD = {
  ft_source: 'google',
  ft_medium: 'cpc',
  ft_campaign: 'spring',
  lt_source: 'newsletter',
  gclid: 'C-abc',
};

function assertStamped(event: { event_name: string; schema_version: unknown; marketing_trail?: unknown }) {
  expect(typeof event.event_name).toBe('string');
  expect(typeof event.schema_version).toBe('string');
  expect(event.marketing_trail).toBeTruthy();
}

describe('lead builders', () => {
  it('createOrIdentify emits a stamped lead event with trail passthrough', async () => {
    const event = await buildLeadCreateOrIdentify(
      {
        email: 'a@b.co',
        name: 'Ana',
        visitorId: 'v-1',
        attributionPayloadJson: JSON.stringify(TRAIL_PAYLOAD),
      },
      { siteId: 'site-1', workspaceId: 'ws-1' },
    );
    assertStamped(event);
    expect(event.event_name).toBe('lead_created');
    expect(event['email']).toBe('a@b.co');
    expect(event['visitor_id']).toBe('v-1');
    expect(event['ft_source']).toBe('google');
    const trail = event.marketing_trail as unknown as Record<string, unknown>;
    expect(trail['site_id']).toBe('site-1');
    expect(trail['workspace_id']).toBe('ws-1');
    expect((trail['click_ids'] as unknown as Record<string, string>)['gclid']).toBe('C-abc');
  });

  it('attachAttribution merges JSON payload and flat collection (flat wins)', async () => {
    const event = await buildAttachAttribution({
      attributionPayloadJson: JSON.stringify(TRAIL_PAYLOAD),
      flatAttribution: { fbclid: 'FB-1', lt_channel: 'email' },
    });
    assertStamped(event);
    expect(event.event_name).toBe('lead_created');
    expect(event['fbclid']).toBe('FB-1');
    expect(event['lt_channel']).toBe('email');
    expect(event['ft_source']).toBe('google');
  });

  it('attachAttribution rejects invalid JSON and empty input', async () => {
    await expect(buildAttachAttribution({ attributionPayloadJson: '{broken' })).rejects.toThrow(TypeError);
    await expect(buildAttachAttribution({ attributionPayloadJson: '[1,2]' })).rejects.toThrow(/flat object/);
    await expect(buildAttachAttribution({})).rejects.toThrow(TypeError);
  });

  it('updateStage requires stage and passes leadId through', async () => {
    const event = await buildUpdateStage({ stage: 'demo_booked', leadId: 'lead_9' });
    expect(event.event_name).toBe('lead_updated');
    expect(event['stage']).toBe('demo_booked');
    expect(event['lead_id']).toBe('lead_9');
    await expect(buildUpdateStage({ stage: '  ' })).rejects.toThrow(/non-empty string/);
  });

  it('markQualified requires leadId', async () => {
    const event = await buildMarkQualified({ leadId: 'lead_1' });
    expect(event.event_name).toBe('lead_qualified');
    expect(event['lead_id']).toBe('lead_1');
    await expect(buildMarkQualified({ leadId: undefined as unknown as string })).rejects.toThrow(TypeError);
  });

  it('mergeVisitor requires both ids', async () => {
    const event = await buildMergeVisitor({ anonymousVisitorId: 'anon_1', knownContactId: 'c-1' });
    expect(event.event_name).toBe('lead_merged');
    expect(event['anonymous_visitor_id']).toBe('anon_1');
    await expect(buildMergeVisitor({ anonymousVisitorId: 'a', knownContactId: '' })).rejects.toThrow(TypeError);
  });
});

describe('conversion builders — validation rejection matrix', () => {
  it('recordSale requires transactionId, positive value, currency', async () => {
    const event = await buildRecordSale(
      { transactionId: 't-1', value: 99.5, currency: 'EUR' },
      { consent: { analytics: true, advertising: true } },
    );
    assertStamped(event);
    expect(event.event_name).toBe('sale');
    expect(event['transaction_id']).toBe('t-1');
    expect((event.marketing_trail as unknown as Record<string, unknown>)['consent']).toEqual({
      analytics: true,
      advertising: true,
    });

    await expect(buildRecordSale({ transactionId: '', value: 10, currency: 'EUR' })).rejects.toThrow(/transactionId/);
    await expect(buildRecordSale({ transactionId: 't', value: 0, currency: 'EUR' })).rejects.toThrow(/value/);
    await expect(buildRecordSale({ transactionId: 't', value: -5, currency: 'EUR' })).rejects.toThrow(/value/);
    await expect(buildRecordSale({ transactionId: 't', value: Number.NaN, currency: 'EUR' })).rejects.toThrow(/value/);
    await expect(buildRecordSale({ transactionId: 't', value: 10, currency: '  ' })).rejects.toThrow(/currency/);
  });

  it('recordRecurringRevenue requires subscriptionId/value/currency; interval optional', async () => {
    const event = await buildRecordRecurringRevenue({
      subscriptionId: 'sub_1',
      value: 29,
      currency: 'USD',
      interval: 'month',
    });
    expect(event.event_name).toBe('sale');
    expect(event['interval']).toBe('month');

    await expect(
      buildRecordRecurringRevenue({ subscriptionId: '', value: 1, currency: 'USD' }),
    ).rejects.toThrow(/subscriptionId/);
    await expect(
      buildRecordRecurringRevenue({ subscriptionId: 's', value: 1, currency: '' }),
    ).rejects.toThrow(/currency/);
  });

  it('recordRefund requires originalTransactionId; value is negative-safe', async () => {
    const negative = await buildRecordRefund({ originalTransactionId: 't-1', value: -49.9 });
    expect(negative.event_name).toBe('refund');
    expect(negative['value']).toBe(-49.9);
    const zero = await buildRecordRefund({ originalTransactionId: 't-1', value: 0 });
    expect(zero['value']).toBe(0);
    const noValue = await buildRecordRefund({ originalTransactionId: 't-1' });
    expect(noValue['value']).toBeUndefined();

    await expect(buildRecordRefund({ originalTransactionId: '' })).rejects.toThrow(/originalTransactionId/);
    await expect(buildRecordRefund({ originalTransactionId: 't-1', value: Number.POSITIVE_INFINITY })).rejects.toThrow(
      /finite/,
    );
  });

  it('sendOfflineConversion needs clickId or trailId plus conversionName', async () => {
    const byClick = await buildSendOfflineConversion({ clickId: 'GCLID-1', conversionName: 'quote_request' });
    expect(byClick.event_name).toBe('sale');
    expect(byClick['click_id']).toBe('GCLID-1');

    const byTrail = await buildSendOfflineConversion({ trailId: 'trl_7', conversionName: 'quote_request' });
    expect(byTrail['trail_id']).toBe('trl_7');

    await expect(buildSendOfflineConversion({ conversionName: 'x' })).rejects.toThrow(/clickId or trailId/);
    await expect(buildSendOfflineConversion({ clickId: 'c', conversionName: '' })).rejects.toThrow(/conversionName/);
  });

  it('appointment ops validate money only when present', async () => {
    const booked = await buildRecordAppointment({ bookingId: 'b-1', startDate: '2026-09-01T10:00:00Z' });
    expect(booked.event_name).toBe('booking_created');
    expect(booked['booking_id']).toBe('b-1');

    await expect(buildRecordAppointment({ value: -1 })).rejects.toThrow(/value/);
    await expect(buildRecordAppointment({ currency: '' })).resolves.toBeTruthy();

    const completed = await buildRecordCompletedAppointment({ bookingId: 'b-2' });
    expect(completed.event_name).toBe('booking_completed');
  });
});

describe('consent builders', () => {
  it('recordConsent validates state enum and stamps the event', async () => {
    for (const state of ['granted', 'denied', 'withdrawn'] as const) {
      const event = await buildRecordConsent({ state, source: 'cookie-banner', policyVersion: '2026-08' });
      expect(event.event_name).toBe('consent_updated');
      expect(event['consent_state']).toBe(state);
      expect(event['consent_source']).toBe('cookie-banner');
      expect(event['consent_version']).toBe('2026-08');
    }
    await expect(buildRecordConsent({ state: 'maybe' as never })).rejects.toThrow(/state must be one of/);
    await expect(buildRecordConsent({ state: '' as never })).rejects.toThrow(TypeError);
  });

  it('recordWithdrawal + updateConsentPolicy emit their events', async () => {
    const withdrawn = await buildRecordWithdrawal({ source: 'settings-page' });
    expect(withdrawn.event_name).toBe('consent_updated');
    expect(withdrawn['consent_state']).toBe('withdrawn');

    const policy = await buildUpdateConsentPolicy({ source: 'legal-team', policyVersion: 'v3' });
    expect(policy.event_name).toBe('consent_updated');
    expect(policy['consent_source']).toBe('legal-team');
    expect(policy['consent_version']).toBe('v3');

    await expect(buildUpdateConsentPolicy({ source: '', policyVersion: 'v3' })).rejects.toThrow(/source/);
    await expect(buildUpdateConsentPolicy({ source: 'legal-team', policyVersion: '' })).rejects.toThrow(
      /policyVersion/,
    );
  });

  it('anonymizeVisitor requires visitorId and emits a deletion request event', async () => {
    const event = await buildAnonymizeVisitor({ visitorId: 'v-del' }, { siteId: 's' });
    expect(event.event_name).toBe('visitor_anonymized');
    expect(event['visitor_id']).toBe('v-del');
    await expect(buildAnonymizeVisitor({ visitorId: ' ' })).rejects.toThrow(TypeError);
  });
});

describe('payload contracts', () => {
  it('unknown fields pass through as extra data', async () => {
    const event = await buildRecordSale({ transactionId: 't', value: 1, currency: 'EUR', crmDealUrl: 'https://crm/x' });
    expect(event['crmDealUrl']).toBe('https://crm/x');
  });

  it('every stamped event carries string-typed version fields last-writer-wins', async () => {
    const event = await buildRecordSale({ transactionId: 't', value: 5, currency: 'EUR' });
    expect(typeof event.schema_version).toBe('string');
    expect(typeof event.classifier_version).toBe('string');
  });

  it('createOrIdentify works without an attribution payload', async () => {
    const event = await buildLeadCreateOrIdentify({ email: 'x@y.z' });
    expect(event.event_name).toBe('lead_created');
    expect(event['email']).toBe('x@y.z');
    expect(event.marketing_trail).toBeTruthy();
  });
});
