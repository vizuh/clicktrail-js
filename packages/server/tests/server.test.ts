import { describe, expect, it, vi } from 'vitest';
import {
  ClickTrailServer,
  parseIdentityFromCookies,
} from '../src/server.js';

const ATTRIBUTION_COOKIE = `attribution=${encodeURIComponent(
  JSON.stringify({
    ft_source: 'google',
    ft_channel: 'paid_search',
    gclid: 'C-1',
    landing_page: 'https://example.com/?gclid=C-1',
  }),
)}`;
const SESSION_COOKIE = `ct_session=${encodeURIComponent(
  JSON.stringify({ visitor_id: 'v-1', session_id: 's-9', session_number: 2, last_event_ts: 1 }),
)}`;

describe('parseIdentityFromCookies', () => {
  it('parses attribution payload + session identity', () => {
    const id = parseIdentityFromCookies(`${ATTRIBUTION_COOKIE}; ${SESSION_COOKIE}`);
    expect(id.payload['ft_source']).toBe('google');
    expect(id.visitorId).toBe('v-1');
    expect(id.sessionId).toBe('s-9');
    expect(id.sessionNumber).toBe(2);
  });

  it('falls back to lightweight visitor/session cookies', () => {
    const id = parseIdentityFromCookies('ct_visitor_id=v-f; ct_session_id=s-f');
    expect(id.visitorId).toBe('v-f');
    expect(id.sessionId).toBe('s-f');
    expect(id.payload).toEqual({});
  });

  it('tolerates null, empty, and corrupt cookies', () => {
    expect(parseIdentityFromCookies(null)).toEqual({ payload: {} });
    expect(parseIdentityFromCookies('attribution=%7Bbroken').payload).toEqual({});
  });
});

function makeServer(fetchMock: ReturnType<typeof vi.fn>) {
  return new ClickTrailServer({
    endpoint: 'https://collector.example.com/v1/events',
    siteId: 's1',
    workspaceId: 'w1',
    fetch: fetchMock as unknown as typeof fetch,
  });
}

function okFetch() {
  return vi.fn(async () => new Response(null, { status: 204 }));
}

describe('ClickTrailServer', () => {
  it('trackLead sends a schema-stamped canonical event with identity + envelope ids', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    const result = await server.trackLead({
      identity: parseIdentityFromCookies(`${ATTRIBUTION_COOKIE}; ${SESSION_COOKIE}`),
      eventId: 'lead-provider-1',
      data: {
        formId: 'contact',
        leadId: 'lead_42',
        lead_id: 'attacker-lead',
        marketing_trail: { site_id: 'attacker', workspace_id: 'other' },
      } as never,
      now: '2026-08-24T10:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, status: 204 });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    const event = sent.events[0]!;
    expect(event['event_name']).toBe('lead_created');
    expect(event['schema_version']).toBeTypeOf('string');
    expect(event['classifier_version']).toBeTypeOf('string');
    expect(event['ft_source']).toBe('google');
    expect(event['form_id']).toBe('contact');
    expect(event['formId']).toBeUndefined();
    expect(event['lead_id']).toBe('lead_42');
    expect(event['event_id']).toBe('evt_lead-provider-1');
    expect(event['occurred_at']).toBe('2026-08-24T10:00:00.000Z');
    expect(event['event_time']).toBeUndefined();
    expect(event['visitor_id']).toBe('v-1');
    expect(event['session_id']).toBe('s-9');
    expect(event['session_number']).toBe('2');
    expect(event['site_id']).toBe('s1');
    expect(event['workspace_id']).toBe('w1');
    expect(event['marketing_trail']).toMatchObject({
      site_id: 's1',
      workspace_id: 'w1',
      event_id: 'evt_lead-provider-1',
      lead_id: 'lead_42',
      occurred_at: '2026-08-24T10:00:00.000Z',
    });
    expect(init.redirect).toBe('error');
  });

  it('maps purchase transactionId to canonical order_id', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    await server.trackPurchase({
      identity: { payload: {} },
      eventId: 'pix-provider-1',
      data: { transactionId: 'invoice-42', value: 49.9, currency: 'EUR' },
      now: '2026-08-24T10:05:00.000Z',
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['event_name']).toBe('sale');
    expect(event['order_id']).toBe('invoice-42');
    expect(event['transactionId']).toBeUndefined();
    expect(event['occurred_at']).toBe('2026-08-24T10:05:00.000Z');
    expect(event['marketing_trail']).toMatchObject({
      event_id: 'evt_pix-provider-1',
      occurred_at: '2026-08-24T10:05:00.000Z',
    });
  });

  it('maps bookingId to canonical booking_id and preserves occurred_at', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    await server.trackBooking({
      identity: { payload: {} },
      eventId: 'booking-provider-1',
      data: { bookingId: 'booking_42', startDate: '2026-09-19T10:00:00.000Z', value: 20, currency: 'BRL' },
      now: '2026-09-19T09:00:00.000Z',
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['event_name']).toBe('booking_created');
    expect(event['booking_id']).toBe('booking_42');
    expect(event['bookingId']).toBeUndefined();
    expect(event['start_date']).toBe('2026-09-19T10:00:00.000Z');
    expect(event['occurred_at']).toBe('2026-09-19T09:00:00.000Z');
  });

  it('derives the same ID for a repeated conversion key when eventId is omitted', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    const input = {
      identity: { payload: {} },
      data: { leadId: 'lead_42' },
      now: '2026-09-20T09:00:00.000Z',
    };
    await server.trackLead(input);
    await server.trackLead(input);
    await server.trackLead({ ...input, data: { leadId: 'lead_43' } });

    const ids = fetchMock.mock.calls.map((call) => {
      const [, init] = call as unknown as [string, RequestInit];
      const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
      return event['event_id'];
    });
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('does not promote canonical fields from untrusted conversion data', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    await server.trackLead({
      identity: { payload: {} },
      data: {
        visitor_id: 'attacker-visitor',
        session_id: 'attacker-session',
        session_number: '999',
        trail_id: 'attacker-trail',
        anonymous_id: 'attacker-anonymous',
        email: 'must-not-be-forwarded',
        marketing_trail: { site_id: 'attacker-site', workspace_id: 'attacker-workspace' },
      },
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['visitor_id']).toBeUndefined();
    expect(event['session_id']).toBeUndefined();
    expect(event['session_number']).toBeUndefined();
    expect(event['email']).toBeUndefined();
    expect(event['marketing_trail']).toMatchObject({
      site_id: 's1',
      workspace_id: 'w1',
      trail_id: '',
      anonymous_id: '',
    });
  });

  it('carries a trusted typed event ID while ignoring a raw reserved event ID', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    await server.trackLead({
      identity: { payload: {} },
      eventId: 'evt_trusted',
      data: { event_id: 'evt_attacker' },
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['event_id']).toBe('evt_trusted');
    expect(event['marketing_trail']).toMatchObject({ event_id: 'evt_trusted' });
  });

  it('normalizes a typed event ID consistently across event surfaces', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    await server.trackLead({ identity: { payload: {} }, eventId: 'response-1' });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['event_id']).toBe('evt_response-1');
    expect(event['marketing_trail']).toMatchObject({ event_id: 'evt_response-1' });
  });

  it('trackPurchase validates transaction fields before sending', async () => {
    const server = makeServer(okFetch());
    await expect(
      server.trackPurchase({ identity: { payload: {} }, data: { transactionId: '', value: 1, currency: 'EUR' } }),
    ).rejects.toThrow(/transactionId/);
    await expect(
      server.trackPurchase({ identity: { payload: {} }, data: { transactionId: 't', value: 0, currency: 'EUR' } }),
    ).rejects.toThrow(/purchase\.value/);
    await expect(
      server.trackPurchase({ identity: { payload: {} }, data: { transactionId: 't', value: 5 } as never }),
    ).rejects.toThrow(/currency/);
  });

  it('trackBooking rejects a non-positive or non-numeric value', async () => {
    const server = makeServer(okFetch());
    await expect(
      server.trackBooking({ identity: { payload: {} }, data: { value: -3 } }),
    ).rejects.toThrow(/booking\.value/);
  });

  it('delivery failure resolves to ok:false instead of throwing', async () => {
    const server = makeServer(
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(server.trackLead({ identity: { payload: {} } })).resolves.toEqual({ ok: false, status: 0 });
  });

  it('rejects non-public collector destinations at construction', () => {
    expect(() => new ClickTrailServer({ endpoint: 'https://127.0.0.1/events' })).toThrow(/public absolute https/);
    expect(() => new ClickTrailServer({ endpoint: 'https://169.254.169.254/latest/meta-data' })).toThrow(/public absolute https/);
  });

  it('emits a stable non-empty event ID when no explicit ID is supplied', async () => {
    const fetchMock = okFetch();
    const server = makeServer(fetchMock);
    const input = { identity: { payload: {}, visitorId: 'v-1', sessionId: 's-1' }, data: { leadId: 'lead-1' } };
    await server.trackLead(input);
    await server.trackLead(input);
    const first = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { events: Array<Record<string, unknown>> };
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as { events: Array<Record<string, unknown>> };
    expect(first.events[0]?.['event_id']).toEqual(second.events[0]?.['event_id']);
    expect(first.events[0]?.['event_id']).toMatch(/^evt_s-/);
    expect(first.events[0]?.['event_id']).toBe(first.events[0]?.['marketing_trail'] && (first.events[0]?.['marketing_trail'] as Record<string, unknown>)['event_id']);
    const other = await server.trackLead({ identity: { payload: {}, visitorId: 'v-2', sessionId: 's-2' }, data: { leadId: 'lead-1' } });
    expect(other).toEqual({ ok: true, status: 204 });
    const third = JSON.parse(String((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body)) as { events: Array<Record<string, unknown>> };
    expect(third.events[0]?.['event_id']).not.toBe(first.events[0]?.['event_id']);
  });

  it('filters arbitrary and identity fields from attribution cookies', () => {
    const raw = encodeURIComponent(JSON.stringify({
      ft_source: 'google',
      email: 'victim@example.com',
      visitor_id: 'forged-visitor',
      session_id: 'forged-session',
      pii: 'secret',
    }));
    const id = parseIdentityFromCookies(`attribution=${raw}`);
    expect(id.payload).toEqual({ ft_source: 'google' });
    expect(id.visitorId).toBeUndefined();
    expect(id.sessionId).toBeUndefined();
  });

});
