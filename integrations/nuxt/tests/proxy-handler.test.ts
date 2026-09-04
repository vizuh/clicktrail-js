import { afterEach, describe, expect, it, vi } from 'vitest';
import clicktrailProxyHandler, { resolveProxyConfig } from '../src/runtime/proxy.handler.js';
import type { ClickTrailProxyOverride } from '../src/runtime/proxy.handler.js';

const UPSTREAM = 'https://collector.example.com/v1/events';

function fakeEvent(opts: {
  upstream?: string;
  url?: string;
  method?: string;
  contentType?: string;
  body?: string;
} = {}) {
  const encoder = new TextEncoder();
  const bodyChunks = opts.body === undefined ? [] : [encoder.encode(opts.body)];
  return {
    node: {
      req: {
        url: opts.url ?? '/api/clicktrail',
        method: opts.method ?? 'POST',
        headers: {
          'content-type': opts.contentType ?? 'application/json',
          ...(opts.contentType === undefined ? {} : {}),
        },
        [Symbol.asyncIterator]: async function* () {
          for (const c of bodyChunks) yield c;
        },
      },
    },
    context: {
      _nitro: {
        runtimeConfig: {
          clicktrailServer: {
            proxy: opts.upstream ? { upstream: opts.upstream, forwardHeaders: ['user-agent'] } : null,
          },
        },
      },
    },
  };
}

afterEach(() => {
  delete (globalThis as { __CLICKTRAIL_NUXT_PROXY__?: ClickTrailProxyOverride }).__CLICKTRAIL_NUXT_PROXY__;
});

describe('resolveProxyConfig', () => {
  it('prefers the globalThis runtime override over baked config', () => {
    (globalThis as { __CLICKTRAIL_NUXT_PROXY__?: ClickTrailProxyOverride }).__CLICKTRAIL_NUXT_PROXY__ = {
      upstream: UPSTREAM,
    };
    const cfg = resolveProxyConfig(fakeEvent());
    expect(cfg?.upstream).toBe(UPSTREAM);
    expect(cfg?.forwardHeaders).toEqual(['user-agent', 'referer']);
  });

  it('returns null when no absolute upstream is resolvable', () => {
    expect(resolveProxyConfig(fakeEvent())).toBeNull();
    (globalThis as { __CLICKTRAIL_NUXT_PROXY__?: ClickTrailProxyOverride }).__CLICKTRAIL_NUXT_PROXY__ = {};
    expect(resolveProxyConfig(fakeEvent())).toBeNull();
  });
});

describe('clicktrailProxyHandler', () => {
  it('forwards a valid batch and strips IP headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const response = await clicktrailProxyHandler(
        fakeEvent({
          upstream: UPSTREAM,
          body: JSON.stringify({ events: [{ event_name: 'page_view' }] }),
        }) as never,
      );
      expect(response.status).toBe(204);
      const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
      expect(url).toBe(UPSTREAM);
      const headers = new Headers(init.headers);
      expect(headers.get('content-type')).toContain('application/json');
      expect(headers.get('x-forwarded-for')).toBeNull();
      expect(init.redirect).toBe('error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('applies the full validation matrix to the reconstructed request', async () => {
    const response415 = await clicktrailProxyHandler(
      fakeEvent({ upstream: UPSTREAM, contentType: 'text/plain', body: 'x' }) as never,
    );
    expect(response415.status).toBe(415);

    const response400 = await clicktrailProxyHandler(
      fakeEvent({ upstream: UPSTREAM, body: '{broken' }) as never,
    );
    expect(response400.status).toBe(400);
  });

  it('returns 502 when no upstream is configured', async () => {
    const response = await clicktrailProxyHandler(
      fakeEvent({ body: JSON.stringify({ events: [{ event_name: 'x' }] }) }) as never,
    );
    expect(response.status).toBe(502);
  });

  it('returns 502 for a non-ok upstream response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    try {
      const response = await clicktrailProxyHandler(
        fakeEvent({
          upstream: UPSTREAM,
          body: JSON.stringify({ events: [{ event_name: 'x' }] }),
        }) as never,
      );
      expect(response.status).toBe(502);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
