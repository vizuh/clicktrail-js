import { describe, expect, it, vi } from 'vitest';
import { createSendEventHandler } from '../src/api/operation.js';

const OK_RESPONSE = new Response('{}', { status: 200 });

function jsonResponse(status: number): Response {
  return new Response('{}', { status });
}

function baseConfig(extra: Record<string, unknown> = {}) {
  return {
    eventName: 'lead_created',
    payload: '{"lt_source":"google"}',
    endpoint: 'https://collector.test/collect',
    siteId: 'site-1',
    consentAnalytics: true,
    consentAdvertising: false,
    ...extra,
  };
}

describe('sendEventHandler (fake fetch matrix)', () => {
  it('posts a single-event batch with correct headers and body', async () => {
    const fetchImpl = vi.fn(async () => OK_RESPONSE);
    const handler = createSendEventHandler({ fetchImpl });
    const result = await handler(baseConfig());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://collector.test/collect');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-clicktrail-key']).toBeUndefined();
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.['event_name']).toBe('lead_created');
    expect(body.events[0]?.['marketing_trail']).toBeTruthy();
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it('sends X-ClickTrail-Key from config over env', async () => {
    const fetchImpl = vi.fn(async () => OK_RESPONSE);
    const handler = createSendEventHandler({
      fetchImpl,
      env: { CLICKTRAIL_API_KEY: 'env-key' },
    });
    await handler(baseConfig({ apiKey: 'cfg-key' }));
    const headers = ((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]).headers as Record<string, string>;
    expect(headers['x-clicktrail-key']).toBe('cfg-key');
  });

  it('falls back to env-provided endpoint and key', async () => {
    const fetchImpl = vi.fn(async () => OK_RESPONSE);
    const handler = createSendEventHandler({
      fetchImpl,
      env: {
        CLICKTRAIL_ENDPOINT: 'https://env-collector.test/collect',
        CLICKTRAIL_API_KEY: 'env-key',
      },
    });
    const result = await handler({ eventName: 'booking_created' });
    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://env-collector.test/collect');
    expect(((init.headers ?? {}) as Record<string, string>)['x-clicktrail-key']).toBe('env-key');
  });

  it.each([401, 404, 500])('reports ok:false with status %i on non-2xx', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status));
    const handler = createSendEventHandler({ fetchImpl });
    const result = await handler(baseConfig());
    expect(result).toMatchObject({ ok: false, status });
    expect(typeof result.error === 'string' || result.error === undefined).toBe(true);
  });

  it('NEVER throws into the Flow engine: network failure returns {ok:false,status:0}', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const handler = createSendEventHandler({ fetchImpl, log: { warn: () => undefined } });
    await expect(handler(baseConfig())).resolves.toEqual({
      ok: false,
      status: 0,
      error: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('never throws on missing eventName / bad payload JSON / missing endpoint', async () => {
    const fetchImpl = vi.fn(async () => OK_RESPONSE);
    const handler = createSendEventHandler({ fetchImpl });

    const noName = await handler({ eventName: '' });
    expect(noName).toMatchObject({ ok: false, status: 400 });
    expect(noName.error).toContain('eventName');

    const badJson = await handler(baseConfig({ payload: '{oops' }));
    expect(badJson).toMatchObject({ ok: false, status: 400 });
    expect(badJson.error).toContain('payload');

    const noEndpoint = await handler({ eventName: 'lead_created' }, undefined);
    expect(noEndpoint).toMatchObject({ ok: false, status: 400 });
    expect(noEndpoint.error).toContain('endpoint');

    // Config-level failures never reach fetch.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a valid payload object and passes it through to the event', async () => {
    const fetchImpl = vi.fn(async () => OK_RESPONSE);
    const handler = createSendEventHandler({ fetchImpl });
    const result = await handler(baseConfig({ payload: '{"visitor_id":"v1","gclid":"G9"}' }));
    expect(result.ok).toBe(true);
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]?.['gclid']).toBe('G9');
    expect(body.events[0]?.['visitor_id']).toBe('v1');
  });
});
