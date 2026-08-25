import { describe, expect, it, vi } from 'vitest';
import { createProxyHandler, resolveProxyConfig } from '../src/proxy.js';
import { defaultProxyConfig } from '../src/config.js';

function makeConfig(overrides: Partial<ReturnType<typeof defaultProxyConfig>> = {}) {
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

describe('resolveProxyConfig', () => {
  it('requires a public absolute https upstream', () => {
    expect(() => resolveProxyConfig(JSON.stringify(defaultProxyConfig()))).toThrow(/public absolute https/);
    expect(() => resolveProxyConfig(JSON.stringify(makeConfig({ upstream: 'https://' })))).toThrow(/public absolute https/);
    expect(() => resolveProxyConfig(JSON.stringify(makeConfig({ upstream: 'https://user:pass@up.example.com' })))).toThrow(/public absolute https/);
    expect(() =>
      resolveProxyConfig(JSON.stringify(makeConfig())),
    ).not.toThrow();
  });

  it('rejects invalid limits and sensitive forwarded headers', () => {
    expect(() => resolveProxyConfig(JSON.stringify(makeConfig({ maxBodyBytes: 0 })))).toThrow(/maxBodyBytes/);
    expect(() => resolveProxyConfig(JSON.stringify(makeConfig({ maxBatchEvents: 0 })))).toThrow(/maxBatchEvents/);
    expect(() => resolveProxyConfig(JSON.stringify(makeConfig({ forwardHeaders: ['cookie'] })))).toThrow(/unsafe header/);
  });
});

describe('createProxyHandler POST', () => {
  it('forwards a valid batch to the upstream with allowlisted headers only', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const handler = createProxyHandler(
      makeConfig({ forwardHeaders: ['user-agent'] }),
      fetchImpl as unknown as typeof fetch,
    );
    const response = await handler.POST(
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

  it('returns 415 for non-JSON content types', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn());
    const response = await handler.POST(new Request('https://x/', { method: 'POST', body: 'x' }));
    expect(response.status).toBe(415);
  });

  it('returns 413 over the body cap (declared and actual)', async () => {
    const handler = createProxyHandler(makeConfig({ maxBodyBytes: 16 }), vi.fn());
    const big = JSON.stringify({ events: Array.from({ length: 40 }, () => ({ event_name: 'e'.repeat(50) })) });
    expect((await handler.POST(jsonRequest(big))).status).toBe(413);
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn());
    expect((await handler.POST(jsonRequest('{nope'))).status).toBe(400);
  });

  it('returns 400 when events is missing, empty, oversized, or malformed', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn());
    for (const bad of [
      {},
      { events: [] },
      { events: [{ nope: true }] },
      { events: [{ event_name: '   ' }] },
      { events: Array.from({ length: 51 }, () => ({ event_name: 'page_view' })) },
    ]) {
      expect((await handler.POST(jsonRequest(bad))).status).toBe(400);
    }
  });

  it('returns 502 when the upstream responds non-ok or fails', async () => {
    const failing = createProxyHandler(makeConfig(), (async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect((await failing.POST(jsonRequest(validBatch))).status).toBe(502);

    const throwing = createProxyHandler(makeConfig(), (async () => { throw new Error('down'); }) as unknown as typeof fetch);
    expect((await throwing.POST(jsonRequest(validBatch))).status).toBe(502);
  });

  it('GET returns 405', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn());
    expect((await handler.GET(new Request('https://x/'))).status).toBe(405);
  });
});
