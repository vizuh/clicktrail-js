import { describe, expect, it, vi } from 'vitest';
import { ClickTrailServer, parseIdentityFromCookies } from '../src/server.js';
import { ATTRIBUTION_KEY, SESSION_ID_FALLBACK_KEY } from '@vizuh/clicktrail-browser';

const identity = {
  payload: { ft_source: 'google', lt_source: 'newsletter', gclid: 'G1' },
  visitorId: 'vis_1',
  sessionId: 'ses_1',
};

describe('ClickTrailServer conversion matrix', () => {
  it('trackPurchase sends a canonical sale event with identity fields', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const server = new ClickTrailServer({ endpoint: 'https://collector.test/collect', fetch: fetchImpl });
    const result = await server.trackPurchase({
      identity,
      data: { transactionId: 'T1', value: 42.5, currency: 'EUR' },
      now: '2026-08-24T10:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://collector.test/collect');
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(1);
    const event = body.events[0]!;
    expect(event['event_name']).toBe('sale');
    expect(event['schema_version']).toBeDefined();
    expect(event['transactionId']).toBe('T1');
    expect(event['value']).toBe(42.5);
    expect(event['currency']).toBe('EUR');
    expect(event['visitor_id']).toBe('vis_1');
    expect(event['session_id']).toBe('ses_1');
    expect(event['event_time']).toBe('2026-08-24T10:00:00.000Z');
  });

  it('trackLead maps to lead_created and carries formId/leadId', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const server = new ClickTrailServer({ endpoint: 'https://c.test', fetch: fetchImpl });
    const result = await server.trackLead({ identity, data: { formId: 'f1' } });
    expect(result.status).toBe(204);
    const [, init] = fetchImpl.mock.calls[0] as unknown as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]!['event_name']).toBe('lead_created');
  });

  it('trackBooking maps to booking_created and validates optional value', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const server = new ClickTrailServer({ endpoint: 'https://c.test', fetch: fetchImpl });
    await expect(
      server.trackBooking({ identity, data: { value: 100, currency: 'EUR' } }),
    ).resolves.toEqual({ ok: true, status: 200 });
    await expect(
      server.trackBooking({ identity, data: { value: -5 } }),
    ).rejects.toThrow(TypeError);
    await expect(
      server.trackBooking({ identity, data: { value: Number.NaN } }),
    ).rejects.toThrow(TypeError);
  });

  it('purchase validation rejects missing transactionId / non-positive value / empty currency', async () => {
    const server = new ClickTrailServer({
      endpoint: 'https://c.test',
      fetch: (async () => new Response(null, { status: 200 })) as typeof fetch,
    });
    await expect(
      server.trackPurchase({ identity, data: { value: 1, currency: 'EUR' } as never }),
    ).rejects.toThrow(TypeError);
    await expect(
      server.trackPurchase({ identity, data: { transactionId: 'T', value: 0, currency: 'EUR' } }),
    ).rejects.toThrow(TypeError);
    await expect(
      server.trackPurchase({ identity, data: { transactionId: 'T', value: 1, currency: '' } }),
    ).rejects.toThrow(TypeError);
  });

  it('constructor requires a non-empty endpoint', () => {
    expect(() => new ClickTrailServer({ endpoint: '' })).toThrow(TypeError);
    expect(() => new ClickTrailServer({ endpoint: '   ' })).toThrow(TypeError);
  });

  it('network failure degrades to {ok:false,status:0} — never throws', async () => {
    const server = new ClickTrailServer({
      endpoint: 'https://c.test',
      fetch: (async () => { throw new Error('down'); }) as typeof fetch,
    });
    await expect(server.send([])).resolves.toEqual({ ok: false, status: 0 });
  });

  it('HTTP failures surface status without throwing', async () => {
    const server = new ClickTrailServer({
      endpoint: 'https://c.test',
      fetch: (async () => new Response(null, { status: 500 })) as typeof fetch,
    });
    await expect(server.send([])).resolves.toEqual({ ok: false, status: 500 });
  });

  it('siteId/workspaceId ride along on every built event', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const server = new ClickTrailServer({
      endpoint: 'https://c.test',
      siteId: 'site-9',
      workspaceId: 'ws-7',
      fetch: fetchImpl,
    });
    await server.trackLead({ identity: { payload: {} } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]!['site_id']).toBe('site-9');
    expect(body.events[0]!['workspace_id']).toBe('ws-7');
  });
});

describe('parseIdentityFromCookies', () => {
  it('parses attribution payload + session state + fallbacks', () => {
    const header = [
      `${ATTRIBUTION_KEY}=${encodeURIComponent(JSON.stringify({ ft_source: 'nl' }))}`,
      `ct_session=${encodeURIComponent(JSON.stringify({ visitor_id: 'v9', session_id: 's9', session_number: 3 }))}`,
      `${SESSION_ID_FALLBACK_KEY}=fb-ses`,
    ].join('; ');
    const id = parseIdentityFromCookies(header);
    expect(id.payload).toMatchObject({ ft_source: 'nl' });
    expect(id.visitorId).toBe('v9');
    expect(id.sessionId).toBe('s9');
    expect(id.sessionNumber).toBe(3);
  });

  it('falls back to bare fallback cookies when session state is absent', () => {
    const header = `${SESSION_ID_FALLBACK_KEY}=fb-ses; ct_visitor_id=fb-vis`;
    const id = parseIdentityFromCookies(header);
    expect(id.sessionId).toBe('fb-ses');
    expect(id.visitorId).toBe('fb-vis');
    expect(id.payload).toEqual({});
  });

  it('tolerates empty and corrupt cookie headers', () => {
    expect(parseIdentityFromCookies(null)).toEqual({ payload: {} });
    expect(parseIdentityFromCookies('')).toEqual({ payload: {} });
    const corrupt = parseIdentityFromCookies(`${ATTRIBUTION_KEY}=%{{bad-json}`);
    expect(corrupt.payload).toEqual({});
  });
});
