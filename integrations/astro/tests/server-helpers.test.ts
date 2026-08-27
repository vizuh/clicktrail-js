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
      data: { formId: 'contact' },
      now: '2026-08-24T10:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, status: 204 });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(init.redirect).toBe('error');
    const sent = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    const event = sent.events[0]!;
    expect(event['event_name']).toBe('lead_created');
    expect(event['schema_version']).toBeTypeOf('string');
    expect(event['classifier_version']).toBeTypeOf('string');
    expect(event['ft_source']).toBe('google');
    expect(event['formId']).toBe('contact');
    expect(event['visitor_id']).toBe('v-1');
    expect(event['session_id']).toBe('s-9');
    expect(event['session_number']).toBe('2');
    expect(event['site_id']).toBe('s1');
    expect(event['workspace_id']).toBe('w1');
    expect(event['marketing_trail']).toBeTruthy();
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
  });
});
