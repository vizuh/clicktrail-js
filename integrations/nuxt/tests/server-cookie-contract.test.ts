import { describe, expect, it, vi } from 'vitest';
import { ClickTrailServer, parseIdentityFromCookies } from '../src/server.js';

// A visitor controls this cookie: none of the conversion fields may leak out of it.
const PLANTED_COOKIE = `attribution=${encodeURIComponent(JSON.stringify({
  ft_source: 'google',
  order_id: 'X',
  value: 9999,
  currency: 'USD',
  consent: { advertising: true },
  injected: 'nope',
}))}`;

function capture() {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
  const server = new ClickTrailServer({ endpoint: 'https://c.test', siteId: 's1', fetch: fetchImpl });
  const event = (call = 0): Record<string, unknown> => {
    const [, init] = fetchImpl.mock.calls[call] as unknown as [string, RequestInit];
    return (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
  };
  return { server, event };
}

describe('nuxt server sender: cookie attribution contract', () => {
  it('keeps only canonical attribution from the cookie', async () => {
    const identity = parseIdentityFromCookies(PLANTED_COOKIE);
    expect(identity.payload).toEqual({ ft_source: 'google' });

    const { server, event } = capture();
    await server.trackLead({ identity });
    const body = event();
    expect(body['ft_source']).toBe('google');
    for (const key of ['order_id', 'value', 'currency', 'consent', 'injected']) {
      expect(body[key]).toBeUndefined();
    }
    expect((body['marketing_trail'] as { consent: unknown }).consent).toEqual({
      analytics: false,
      advertising: false,
    });
  });

  it('filters a hand-built identity payload too', async () => {
    const { server, event } = capture();
    await server.trackLead({
      identity: { payload: { lt_source: 'x', order_id: 'X', currency: 'USD' } },
    });
    expect(event()['lt_source']).toBe('x');
    expect(event()['order_id']).toBeUndefined();
    expect(event()['currency']).toBeUndefined();
  });

  it('emits an evt_ event_id mirrored into marketing_trail', async () => {
    const { server, event } = capture();
    await server.trackLead({ identity: parseIdentityFromCookies(PLANTED_COOKIE) });
    const body = event();
    expect(body['event_id']).toMatch(/^evt_/);
    expect((body['marketing_trail'] as { event_id: unknown }).event_id).toBe(body['event_id']);
  });

  it('derives a stable event_id from the business key', async () => {
    const { server, event } = capture();
    const input = { identity: { payload: {} }, data: { transactionId: 'T1', value: 1, currency: 'EUR' } };
    await server.trackPurchase(input);
    await server.trackPurchase({ ...input, now: '2026-01-01T00:00:00.000Z' });
    expect(event(0)['event_id']).toMatch(/^evt_s-/);
    expect(event(1)['event_id']).toBe(event(0)['event_id']);
  });

  it('lets an explicit eventId win, adding the evt_ prefix when missing', async () => {
    const { server, event } = capture();
    await server.trackPurchase({
      identity: { payload: {} },
      data: { transactionId: 'T1', value: 1, currency: 'EUR' },
      eventId: 'retry-1',
    });
    await server.trackLead({ identity: { payload: {} }, eventId: 'evt_keep' });
    expect(event(0)['event_id']).toBe('evt_retry-1');
    expect(event(1)['event_id']).toBe('evt_keep');
    await expect(server.trackLead({ identity: { payload: {} }, eventId: ' ' })).rejects.toThrow(TypeError);
  });
});
