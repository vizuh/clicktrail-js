import { describe, expect, it, vi } from 'vitest';
import { parseIdentityFromCookies, trackConversion } from '../src/server-events.js';

const ENDPOINT = 'https://collector.example.com/v1/events';

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
  const send = (options: Record<string, unknown>) =>
    trackConversion(
      { headers: { get: (name: string) => (name === 'cookie' ? PLANTED_COOKIE : null) } },
      { event: 'lead', endpoint: ENDPOINT, siteId: 's1', fetch: fetchImpl, ...options },
    );
  const event = (call = 0): Record<string, unknown> => {
    const [, init] = fetchImpl.mock.calls[call] as unknown as [string, RequestInit];
    return (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
  };
  return { send, event };
}

describe('sveltekit server sender: cookie attribution contract', () => {
  it('keeps only canonical attribution from the cookie', async () => {
    expect(parseIdentityFromCookies(PLANTED_COOKIE).payload).toEqual({ ft_source: 'google' });

    const { send, event } = capture();
    await send({});
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

  it('emits an evt_ event_id mirrored into marketing_trail', async () => {
    const { send, event } = capture();
    await send({});
    const body = event();
    expect(body['event_id']).toMatch(/^evt_/);
    expect((body['marketing_trail'] as { event_id: unknown }).event_id).toBe(body['event_id']);
  });

  it('derives a stable event_id from the business key', async () => {
    const { send, event } = capture();
    await send({ event: 'purchase', orderId: 'O1', value: 1, currency: 'EUR' });
    await send({ event: 'purchase', orderId: 'O1', value: 1, currency: 'EUR' });
    expect(event(0)['event_id']).toMatch(/^evt_s-/);
    expect(event(1)['event_id']).toBe(event(0)['event_id']);
  });

  it('lets an explicit eventId win, adding the evt_ prefix when missing', async () => {
    const { send, event } = capture();
    await send({ orderId: 'O1', eventId: 'retry-1' });
    await send({ eventId: 'evt_keep' });
    expect(event(0)['event_id']).toBe('evt_retry-1');
    expect(event(1)['event_id']).toBe('evt_keep');
    await expect(send({ eventId: ' ' })).rejects.toThrow(TypeError);
  });
});
