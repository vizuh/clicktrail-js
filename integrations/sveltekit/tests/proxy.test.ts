import { describe, expect, it, vi } from 'vitest';
import { createProxyHandler, dispatchProxyRequest } from '../src/proxy.js';
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

describe('createProxyHandler status matrix', () => {
  it('forwards a valid batch with allowlisted headers only (204)', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const handler = createProxyHandler(makeConfig({ forwardHeaders: ['user-agent'] }), fetchImpl as unknown as typeof fetch);
    const response = await handler.POST(
      jsonRequest(validBatch, { 'user-agent': 'UA-1', 'x-forwarded-for': '203.0.113.9' }),
    );
    expect(response.status).toBe(204);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://up.example.com/v1/events');
    const headers = new Headers(init.headers);
    expect(headers.get('user-agent')).toBe('UA-1');
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(init.redirect).toBe('error');
  });

  it('returns 405 for GET and non-POST methods', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn() as unknown as typeof fetch);
    expect((await handler.GET(new Request('https://x.example.com/api/clicktrail'))).status).toBe(405);
    const viaDispatch = await dispatchProxyRequest(handler, new Request('https://x.example.com/api/clicktrail'));
    expect(viaDispatch.status).toBe(405);
  });

  it('returns 415 for non-JSON content types', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn() as unknown as typeof fetch);
    const response = await handler.POST(new Request('https://x.example.com/api/clicktrail', { method: 'POST', body: 'x' }));
    expect(response.status).toBe(415);
  });

  it('returns 413 when declared content-length exceeds maxBodyBytes', async () => {
    const handler = createProxyHandler(makeConfig({ maxBodyBytes: 10 }), vi.fn() as unknown as typeof fetch);
    const response = await handler.POST(jsonRequest(validBatch, { 'content-length': '9999' }));
    expect(response.status).toBe(413);
  });

  it('returns 413 when the actual body exceeds maxBodyBytes', async () => {
    const handler = createProxyHandler(makeConfig({ maxBodyBytes: 10 }), vi.fn() as unknown as typeof fetch);
    const big = { events: [{ event_name: 'x'.repeat(500) }] };
    const response = await handler.POST(jsonRequest(big));
    expect(response.status).toBe(413);
  });

  it('returns 400 for malformed JSON and invalid batches', async () => {
    const handler = createProxyHandler(makeConfig(), vi.fn() as unknown as typeof fetch);
    expect((await handler.POST(jsonRequest('{nope'))).status).toBe(400);
    expect((await handler.POST(jsonRequest({ events: [] }))).status).toBe(400);
    expect((await handler.POST(jsonRequest({ events: [{ nope: true }] }))).status).toBe(400);
    expect((await handler.POST(jsonRequest({ notEvents: true }))).status).toBe(400);
  });

  it('returns 502 when upstream fails or errors', async () => {
    const failing = createProxyHandler(makeConfig(), vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect((await failing.POST(jsonRequest(validBatch))).status).toBe(502);
    const throwing = createProxyHandler(makeConfig(), vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch);
    expect((await throwing.POST(jsonRequest(validBatch))).status).toBe(502);
  });

  it('rejects unsafe configs before any request handling', () => {
    expect(() => createProxyHandler(defaultProxyConfig(), fetch)).toThrow(/public absolute https/);
    expect(() => createProxyHandler(makeConfig({ upstream: 'https://' }), fetch)).toThrow(/public absolute https/);
    expect(() => createProxyHandler(makeConfig({ upstream: 'https://user:pass@up.example.com' }), fetch)).toThrow(/public absolute https/);
    expect(() => createProxyHandler(makeConfig({ forwardHeaders: ['cookie'] }), fetch)).toThrow(/unsafe header/);
  });

  it('never forwards IP-bearing headers even if allowlisted indirectly', async () => {
    const seenHeaders: Array<string> = [];
    const captureFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seenHeaders.push(...[...new Headers(init?.headers).keys()]);
      return new Response(null, { status: 204 });
    });
    const handler = createProxyHandler(makeConfig(), captureFetch as unknown as typeof fetch);
    await handler.POST(
      jsonRequest(validBatch, {
        'x-real-ip': '10.0.0.1',
        forwarded: 'for=10.0.0.1',
        authorization: 'Bearer x',
        cookie: 'ct_attribution={}',
      }),
    );
    const lower = seenHeaders.map((h) => h.toLowerCase());
    expect(lower).not.toContain('x-real-ip');
    expect(lower).not.toContain('forwarded');
    expect(lower).not.toContain('authorization');
    expect(lower).not.toContain('cookie');
  });
});
