import { describe, expect, it } from 'vitest';
import {
  attachVariablesToPayload,
  buildAppointmentRequestedEvent,
  buildConsentUpdateEvent,
  buildFormStartedEvent,
  buildFormSubmittedEvent,
  buildLeadEvent,
  buildPurchaseEvent,
  buildQualifiedLeadEvent,
  EVENT_NAMES,
  type BlockEvent,
  type BuildMeta,
} from '../src/events.js';
import { resolveTypebotBlockConfig } from '../src/config.js';

const config = resolveTypebotBlockConfig({
  endpoint: 'https://collector.example.com/api/clicktrail',
  siteId: 'site_1',
  workspaceId: 'ws_9',
  apiKey: 'secret-key',
});

const meta: BuildMeta = { config, occurredAt: '2026-08-24T10:00:00.000Z' };

function expectEnvelope(event: BlockEvent, eventName: string): void {
  expect(event.event_name).toBe(eventName);
  expect(event.schema_version).toBe(1);
  expect(event.occurred_at).toBe('2026-08-24T10:00:00.000Z');
  expect(event.site_id).toBe('site_1');
  expect(event.workspace_id).toBe('ws_9');
}

describe('eight action builders (happy path)', () => {
  it("action 1 identify visitor/lead -> 'lead_created'", () => {
    const event = buildLeadEvent({ Email: 'ana@example.com' }, {}, meta);
    expectEnvelope(event, 'lead_created');
    expect(event['email']).toBe('ana@example.com');
  });

  it("action 2 form started -> 'form_started'", () => {
    const event = buildFormStartedEvent({}, {}, meta);
    expectEnvelope(event, EVENT_NAMES.formStarted);
  });

  it("action 3 lead submitted -> 'lead_created'", () => {
    const event = buildFormSubmittedEvent({ Email: 'x@example.com', Phone: '+351910000000' }, {}, meta);
    expectEnvelope(event, EVENT_NAMES.leadSubmitted);
    expect(event.phone).toBe('+351910000000');
  });

  it("action 4 qualified lead -> 'lead_qualified'", () => {
    const event = buildQualifiedLeadEvent({ 'Lead ID': 'lead_123' }, {}, meta);
    expectEnvelope(event, EVENT_NAMES.qualifiedLead);
    expect(event.lead_id).toBe('lead_123');
  });

  it("action 5 appointment requested -> 'booking_created'", () => {
    const event = buildAppointmentRequestedEvent({ Email: 'x@example.com' }, {}, meta);
    expectEnvelope(event, EVENT_NAMES.appointmentRequested);
  });

  it("action 6 purchase -> 'sale'", () => {
    const event = buildPurchaseEvent(
      { transactionId: 'tx_77', value: '499.90', currency: 'eur' },
      {},
      meta,
    );
    expectEnvelope(event, EVENT_NAMES.purchase);
    expect(event.transaction_id).toBe('tx_77');
    expect(event.value).toBe(499.9);
    expect(event.currency).toBe('EUR');
  });

  it('action 7 consent -> one of the three consent event names', () => {
    for (const state of ['granted', 'withdrawn', 'policy_updated'] as const) {
      const event = buildConsentUpdateEvent(state, {}, {}, meta);
      // all three consent states emit the canonical consent_updated event;
      // the state itself rides consent_state.
      expectEnvelope(event, 'consent_updated');
      expect(event.consent_state).toBe(state);
    }
  });

  it('action 8 attach variables merges onto the current payload without sending', () => {
    const next = attachVariablesToPayload(
      { utm_campaign: 'spring-promo', gclid: 'G-123' },
      { email: 'x@example.com' },
      JSON.parse('{"Plan":"premium"}') as Record<string, unknown>,
    );
    expect(next).toEqual({
      email: 'x@example.com',
      campaign: 'spring-promo',
      gclid: 'G-123',
      properties: { Plan: 'premium' },
    });
  });

  it('builders carry the current visitor payload through to the event', () => {
    const payload = attachVariablesToPayload(
      { utm_campaign: 'retarget-q3' },
      { email: 'x@example.com' },
    );
    const event = buildLeadEvent({}, payload, meta);
    expectEnvelope(event, 'lead_created');
    expect(event.campaign).toBe('retarget-q3');
    expect(event.email).toBe('x@example.com');
  });

  it('siteId/workspaceId are omitted when not configured', () => {
    const bare = resolveTypebotBlockConfig({});
    const event = buildFormStartedEvent({}, {}, { config: bare, occurredAt: meta.occurredAt });
    expect(event.site_id).toBeUndefined();
    expect(event.workspace_id).toBeUndefined();
    expect('site_id' in event).toBe(false);
  });
});

describe('rejection matrix (required fields throw TypeError)', () => {
  it("qualified lead without lead id -> TypeError lead_qualified.lead_id", () => {
    expect(() => buildQualifiedLeadEvent({}, {}, meta)).toThrow(TypeError);
    expect(() => buildQualifiedLeadEvent({}, {}, meta)).toThrow(/lead_qualified\.lead_id/);
    expect(() => buildQualifiedLeadEvent({ 'Lead ID': '   ' }, {}, meta)).toThrow(/lead_qualified\.lead_id/);
  });

  it('purchase without transaction id -> TypeError sale.transaction_id', () => {
    expect(() => buildPurchaseEvent({ value: 100, currency: 'EUR' }, {}, meta)).toThrow(/sale\.transaction_id/);
  });

  it('purchase with invalid value -> TypeError sale.recorded.value', () => {
    for (const bad of [undefined, 0, -5, Number.NaN, 'abc']) {
      expect(() =>
        buildPurchaseEvent({ transactionId: 'tx_1', value: bad, currency: 'EUR' }, {}, meta),
      ).toThrow(/sale\.value/);
    }
  });

  it('purchase without currency -> TypeError sale.recorded.currency', () => {
    expect(() =>
      buildPurchaseEvent({ transactionId: 'tx_1', value: 100 }, {}, meta),
    ).toThrow(/sale\.currency/);
  });
});
