import { describe, expect, it, vi } from 'vitest';
import { ClickTrailServer, parseIdentityFromCookies } from '../src/server.js';

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

describe('ClickTrailServer', () => {
  it('validates purchase fields before sending', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const server = makeServer(fetchMock);
    const identity = { payload: {} };
    await expect(
      server.trackPurchase({ identity, data: {} as never }),
    ).rejects.toThrow(/purchase\.transactionId/);
    await expect(
      server.trackPurchase({ identity, data: { transactionId: 't', value: -1, currency: 'EUR' } as never }),
    ).rejects.toThrow(/purchase\.value/);
    await expect(
      server.trackPurchase({ identity, data: { transactionId: 't', value: 1, currency: '' } as never }),
    ).rejects.toThrow(/purchase\.currency/);
    await expect(
      server.trackPurchase({
        identity,
        data: { transactionId: 't-1', value: 49.9, currency: 'EUR' },
      }),
    ).resolves.toEqual({ ok: true, status: 204 });
  });

  it('stamps the schema-stamped canonical payload with identity + site', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const server = makeServer(fetchMock);
    await server.trackPurchase({
      identity: parseIdentityFromCookies(`${ATTRIBUTION_COOKIE}; ${SESSION_COOKIE}`),
      data: { transactionId: 't-9', value: 12.5, currency: 'EUR' },
      now: '2026-01-01T00:00:00.000Z',
    });
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(1);
    const event = body.events[0]!;
    expect(event['event_name']).toBe('purchase');
    expect(event['schema_version']).toBeTruthy();
    expect(event['site_id']).toBe('s1');
    expect(event['workspace_id']).toBe('w1');
    expect(event['visitor_id']).toBe('v-1');
    expect(event['session_id']).toBe('s-9');
    expect(event['session_number']).toBe('2');
    expect(event['transactionId']).toBe('t-9');
    expect(event['value']).toBe(12.5);
    expect(event['currency']).toBe('EUR');
    expect(event['ft_source']).toBe('google');
    expect(event['classifier_version']).toBeTypeOf('string');
    expect(event['marketing_trail']).toBeTruthy();
    expect(event['event_time']).toBe('2026-01-01T00:00:00.000Z');
  });

  it('tracks leads and validates optional booking values', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const server = makeServer(fetchMock);
    const identity = { payload: {}, visitorId: 'v-2' };
    await expect(server.trackLead({ identity, data: { formId: 'f-1' } })).resolves.toEqual({
      ok: true,
      status: 200,
    });
    await expect(
      server.trackBooking({ identity, data: { value: 0 } as never }),
    ).rejects.toThrow(/booking\.value/);
    await expect(
      server.trackBooking({ identity, data: { bookingId: 'b-1' } }),
    ).resolves.toEqual({ ok: true, status: 200 });
  });

  it('resolves { ok: false, status: 0 } when delivery throws', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const server = makeServer(fetchMock);
    await expect(server.trackLead({ identity: { payload: {} } })).resolves.toEqual({
      ok: false,
      status: 0,
    });
  });

  it('requires a non-empty endpoint at construction', () => {
    expect(() => new ClickTrailServer({ endpoint: ' ' })).toThrow(/endpoint/);
  });
});
