import { describe, expect, it, vi } from 'vitest';
import { createEventHandler } from '../src/nitro-utils.js';
import { defaultProxyConfig } from '../src/config.js';

function makeConfig(overrides = {}) {
  return defaultProxyConfig({ upstream: 'https://up.example.com/v1/events', ...overrides });
}

function jsonRequest(body: string | unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://site.example.com/api/clicktrail', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: text,
  });
}

const validBatch = { events: [{ event_name: 'page_view' }] };

describe('createEventHandler config validation', () => {
  it('requires an absolute http(s) upstream', () => {
    expect(() => createEventHandler(defaultProxyConfig(), fetch)).toThrow(/absolute http\(s\)/);
  });

  it('rejects invalid limits and sensitive forwarded headers', () => {
    expect(() => createEventHandler(makeConfig({ maxBodyBytes: 0 }), fetch)).toThrow(/maxBodyBytes/);
    expect(() => createEventHandler(makeConfig({ maxBatchEvents: 0 }), fetch)).toThrow(/maxBatchEvents/);
    expect(() => createEventHandler(makeConfig({ forwardHeaders: ['cookie'] }), fetch)).toThrow(/unsafe header/);
    expect(() => createEventHandler(makeConfig({ forwardHeaders: ['x-forwarded-for'] }), fetch)).toThrow(/unsafe header/);
  });
});

describe('status-code matrix', () => {
  it('forwards a valid batch upstream with allowlisted headers only', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const handler = createEventHandler(
      makeConfig({ forwardHeaders: ['user-agent'] }),
      fetchImpl as unknown as typeof fetch,
    );
    const response = await handler(
      jsonRequest(validBatch, { 'user-agent': 'UA-1', 'x-forwarded-for': '203.0.113.9', referer: 'https://ref.example.com/' }),
    );
    expect(response.status).toBe(204);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://up.example.com/v1/events');
    const headers = new Headers(init.headers);
    expect(headers.get('user-agent')).toBe('UA-1');
    expect(headers.get('referer')).toBeNull(); // not on this config's allowlist
    expect(headers.get('x-forwarded-for')).toBeNull(); // visitor IPs never forwarded
    expect(JSON.parse(String(init.body))).toEqual(validBatch);
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createEventHandler(makeConfig(), fetch);
    const response = await handler(new Request('https://x/', { method: 'GET' }));
    expect(response.status).toBe(405);
  });

  it('returns 415 for non-JSON content types', async () => {
    const handler = createEventHandler(makeConfig(), fetch);
    const response = await handler(new Request('https://x/', { method: 'POST', body: 'x' }));
    expect(response.status).toBe(415);
  });

  it('returns 413 for a declared content-length over the limit', async () => {
    const handler = createEventHandler(makeConfig({ maxBodyBytes: 10 }), fetch);
    const response = await handler(
      jsonRequest(validBatch, { 'content-length': '9999' }),
    );
    expect(response.status).toBe(413);
  });

  it('returns 413 for an actual body over the limit', async () => {
    const handler = createEventHandler(makeConfig({ maxBodyBytes: 10 }), fetch);
    const response = await handler(jsonRequest({ events: [{ event_name: 'x'.repeat(64) }] }));
    expect(response.status).toBe(413);
  });

  it('returns 400 for malformed JSON', async () => {
    const handler = createEventHandler(makeConfig(), fetch);
    const response = await handler(jsonRequest('{broken'));
    expect(response.status).toBe(400);
  });

  it('returns 400 for empty or missing events arrays', async () => {
    const handler = createEventHandler(makeConfig(), fetch);
    expect((await handler(jsonRequest({}))).status).toBe(400);
    expect((await handler(jsonRequest({ events: [] }))).status).toBe(400);
  });

  it('returns 400 when batches exceed maxBatchEvents or events lack names', async () => {
    const handler = createEventHandler(makeConfig({ maxBatchEvents: 2 }), fetch);
    expect((await handler(jsonRequest({ events: [{ event_name: 'a' }, { event_name: 'b' }, { event_name: 'c' }] }))).status).toBe(400);
    expect((await handler(jsonRequest({ events: [{ nope: true }] }))).status).toBe(400);
    expect((await handler(jsonRequest({ events: [{ event_name: '   ' }] }))).status).toBe(400);
  });

  it('returns 502 when upstream responds non-ok or fetch throws', async () => {
    const failing = createEventHandler(makeConfig(), (async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect((await failing(jsonRequest(validBatch))).status).toBe(502);

    const throwing = createEventHandler(makeConfig(), (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    const response = await throwing(jsonRequest(validBatch));
    expect(response.status).toBe(502);
  });
});
