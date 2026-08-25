import { describe, expect, it, vi } from 'vitest';
import { parseIdentityFromCookies, trackConversion } from '../src/server-events.js';

const ENDPOINT = 'https://collector.example.com/v1/events';

function okFetch(body?: unknown) {
  return vi.fn(async (): Promise<Response> => new Response(JSON.stringify(body ?? {}), { status: 200 }));
}

function requestWithCookies(cookie: string | null) {
  return { headers: { get: (name: string) => (name === 'cookie' ? cookie : null) } };
}

describe('parseIdentityFromCookies', () => {
  it('returns an empty payload without a cookie header', () => {
    expect(parseIdentityFromCookies(null)).toEqual({ payload: {} });
  });

  it('reads the ct_attribution and canonical attribution cookies', () => {
    const fromCt = parseIdentityFromCookies(`ct_attribution=${encodeURIComponent(JSON.stringify({ ft_source: 'google' }))}`);
    expect(fromCt.payload['ft_source']).toBe('google');
    const fromCanonical = parseIdentityFromCookies(`attribution=${encodeURIComponent(JSON.stringify({ lt_source: 'x' }))}`);
    expect(fromCanonical.payload['lt_source']).toBe('x');
  });

  it('tolerates corrupt cookies', () => {
    const identity = parseIdentityFromCookies('ct_attribution=%7Bbroken');
    expect(identity.payload).toEqual({});
  });

  it('lifts visitor/session ids from the session state and fallback cookies', () => {
    const state = encodeURIComponent(JSON.stringify({ visitor_id: 'v1', session_id: 's1', session_number: 3 }));
    const identity = parseIdentityFromCookies(`ct_session=${state}; ct_sid=fb-s; ct_vid=fb-v`);
    expect(identity.visitorId).toBe('v1');
    expect(identity.sessionId).toBe('s1');
    expect(identity.sessionNumber).toBe(3);
    const fallbackOnly = parseIdentityFromCookies('ct_session_id=fb-s; ct_visitor_id=fb-v');
    expect(fallbackOnly.visitorId).toBe('fb-v');
    expect(fallbackOnly.sessionId).toBe('fb-s');
  });
});

describe('trackConversion validation matrix (async rejections)', () => {
  it.each([
    [{ event: '' }, /event must be a non-empty string/],
    [{ event: '   ' }, /event must be a non-empty string/],
    [{ event: 'sale', value: 0 }, /value must be a positive finite number/],
    [{ event: 'sale', value: -5 }, /value must be a positive finite number/],
    [{ event: 'sale', value: Number.NaN }, /value must be a positive finite number/],
    [{ event: 'sale', value: Number.POSITIVE_INFINITY }, /value must be a positive finite number/],
    [{ event: 'sale', value: 10, currency: '' }, /currency must be a non-empty string/],
    [{ event: 'lead', leadId: '' }, /leadId must be a non-empty string/],
    [{ event: 'sale', orderId: '  ' }, /orderId must be a non-empty string/],
    [{ event: 'sale', bookingId: '' }, /bookingId must be a non-empty string/],
    [{}, /event must be a non-empty string/],
  ] as Array<[Record<string, unknown>, RegExp]>)('rejects %j', async (options, pattern) => {
    await expect(
      trackConversion(requestWithCookies(null), options as never),
    ).rejects.toThrow(pattern);
  });

  it('never fetches when validation fails', async () => {
    const fetchImpl = okFetch();
    await expect(
      trackConversion(requestWithCookies(null), { event: 'sale', value: -1, endpoint: ENDPOINT, fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/value/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('trackConversion send contract', () => {
  it('sends one canonical event with identity + conversion fields', async () => {
    const fetchImpl = okFetch();
    const cookies =
      `ct_attribution=${encodeURIComponent(JSON.stringify({ ft_source: 'google', gclid: 'g-1' }))}` +
      `; ct_visitor_id=visitor-9; ct_session_id=session-4`;
    const result = await trackConversion(requestWithCookies(cookies), {
      event: 'lead',
      endpoint: ENDPOINT,
      siteId: 'site-1',
      leadId: 'lead-77',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(1);
    const event = body.events[0]!;
    expect(event['event_name']).toBe('lead_created'); // legacy name translated
    expect(event['lead_id']).toBe('lead-77');
    expect(event['site_id']).toBe('site-1');
    expect(event['visitor_id']).toBe('visitor-9');
    expect(event['session_id']).toBe('session-4');
    expect(event['ft_source']).toBe('google');
    expect(event['gclid']).toBe('g-1');
  });

  it('translates legacy purchase -> sale and carries money fields', async () => {
    const fetchImpl = okFetch();
    await trackConversion(requestWithCookies(null), {
      event: 'purchase',
      endpoint: ENDPOINT,
      orderId: 'order-1',
      value: 49.99,
      currency: 'EUR',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]!['event_name']).toBe('sale');
    expect(body.events[0]!['value']).toBe(49.99);
    expect(body.events[0]!['currency']).toBe('EUR');
    expect(body.events[0]!['order_id']).toBe('order-1');
  });

  it('resolves {ok:false,status} on upstream failure and never throws on network errors', async () => {
    const failing = vi.fn(async (): Promise<Response> => new Response(null, { status: 503 }));
    const failed = await trackConversion(requestWithCookies(null), {
      event: 'sale', endpoint: ENDPOINT, fetch: failing as unknown as typeof fetch,
    });
    expect(failed).toEqual({ ok: false, status: 503 });

    const throwing = vi.fn(async (): Promise<Response> => { throw new TypeError('socket down'); });
    const errored = await trackConversion(requestWithCookies(null), {
      event: 'sale', endpoint: ENDPOINT, fetch: throwing as unknown as typeof fetch,
    });
    expect(errored).toEqual({ ok: false, status: 0 });
  });
});
