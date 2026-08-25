import { describe, expect, it } from 'vitest';
import { clicktrail } from '../src/handle.js';
import { ATTRIBUTION_COOKIE, CONSENT_COOKIE, decodeAttributionPayload } from '../src/cookies.js';
import { makeCookieStore } from './helpers.js';
import type { RequestEventLike } from '../src/types.js';

function buildHandle(options?: Parameters<typeof clicktrail>[0]) {
  return clicktrail(options);
}

async function run(handle: ReturnType<typeof clicktrail>, url: string, initialCookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const cs = makeCookieStore(initialCookies);
  const u = new URL(url);
  const fallback = new Response('resolved', { status: 200 });
  const event: RequestEventLike = {
    url: u,
    request: new Request(u, { headers }),
    cookies: cs.store,
  };
  const response = await handle({ event, resolve: async () => fallback });
  return { response, ...cs };
}

describe('clicktrail handle attribution capture', () => {
  it('parses landing UTMs into a ct_attribution cookie', async () => {
    const handle = buildHandle();
    const { jar } = await run(handle, 'https://site.example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=summer');
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeTruthy();
    const payload = decodeAttributionPayload(jar.get(ATTRIBUTION_COOKIE));
    expect(payload['lt_source']).toBe('google');
    expect(payload['lt_medium']).toBe('cpc');
    expect(payload['lt_campaign']).toBe('summer');
    expect(payload['ft_source']).toBe('google');
  });

  it('captures click ids (gclid/gbraid/wbraid/fbclid/msclkid)', async () => {
    const handle = buildHandle();
    const { jar } = await run(handle, 'https://site.example.com/?gclid=abc123&fbclid=f9');
    const payload = decodeAttributionPayload(jar.get(ATTRIBUTION_COOKIE));
    expect(payload['gclid']).toBe('abc123');
    expect(payload['fbclid']).toBe('f9');
  });

  it('round-trips: merges a new touch into an existing cookie payload', async () => {
    const handle = buildHandle();
    const first = decodeAttributionPayload(
      (
        await run(handle, 'https://site.example.com/?utm_source=newsletter&utm_campaign=launch')
      ).jar.get(ATTRIBUTION_COOKIE)!,
    );
    const second = await run(handle, 'https://site.example.com/pricing?utm_source=reddit&utm_campaign=relaunch', {
      [ATTRIBUTION_COOKIE]: encodeURIComponent(JSON.stringify(first)),
    });
    const merged = decodeAttributionPayload(second.jar.get(ATTRIBUTION_COOKIE));
    // last-touch updated
    expect(merged['lt_source']).toBe('reddit');
    // first-touch preserved
    expect(merged['ft_source']).toBe('newsletter');
  });

  it('does not rewrite the cookie when nothing changed', async () => {
    const handle = buildHandle();
    const first = await run(handle, 'https://site.example.com/');
    expect(first.written).toHaveLength(0);
    const stored = encodeURIComponent(JSON.stringify({ lt_source: 'x', ft_source: 'x' }));
    const again = await run(handle, 'https://site.example.com/', { [ATTRIBUTION_COOKIE]: stored });
    expect(again.written).toHaveLength(0);
  });

  it('ignores internal referrers (no touch, no cookie)', async () => {
    const handle = buildHandle();
    const { jar, written } = await run(handle, 'https://site.example.com/page', {}, { referer: 'https://site.example.com/other' });
    expect(written).toHaveLength(0);
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it('writes Path=/ and SameSite=Lax cookie attributes', async () => {
    const handle = buildHandle();
    const { written } = await run(handle, 'https://site.example.com/?utm_source=x');
    expect(written).toHaveLength(1);
    const opts = written[0]!.opts as Record<string, unknown>;
    expect(opts['path']).toBe('/');
    expect(opts['sameSite']).toBe('lax');
  });
});

describe('clicktrail handle consent gate', () => {
  it('defers all persistence when consentRequired and no consent cookie', async () => {
    const handle = buildHandle({ consentRequired: true });
    const { jar, written } = await run(handle, 'https://site.example.com/?utm_source=google');
    expect(written).toHaveLength(0);
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it('persists once ct_consent=granted with consentRequired', async () => {
    const handle = buildHandle({ consentRequired: true });
    const { jar } = await run(handle, 'https://site.example.com/?utm_source=google', {
      [CONSENT_COOKIE]: 'granted',
    });
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeTruthy();
  });

  it('honors an explicit ct_consent=denied even without consentRequired', async () => {
    const handle = buildHandle();
    const { jar, written } = await run(handle, 'https://site.example.com/?utm_source=google', {
      [CONSENT_COOKIE]: 'denied',
    });
    expect(written).toHaveLength(0);
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it('tracks normally when consentRequired=false and no consent cookie exists', async () => {
    const handle = buildHandle({ consentRequired: false });
    const { jar } = await run(handle, 'https://site.example.com/?utm_source=google');
    expect(jar.get(ATTRIBUTION_COOKIE)).toBeTruthy();
  });
});

describe('clicktrail handle proxy short-circuit', () => {
  const upstream = 'https://collector.example.com/v1/events';

  it('short-circuits matching paths into the proxy handler instead of resolve()', async () => {
    const fetchImpl = async (): Promise<Response> => new Response(null, { status: 204 });
    const handle = buildHandle({ proxy: { upstream }, fetch: fetchImpl as typeof fetch });
    // rebuild with fetch injection not exposed -> use dispatch through options
    const cs = makeCookieStore();
    const u = new URL('https://site.example.com/api/clicktrail');
    const event: RequestEventLike = {
      url: u,
      request: new Request(u, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [{ event_name: 'page_view' }] }),
      }),
      cookies: cs.store,
    };
    let resolved = false;
    const res = await handle({ event, resolve: async () => { resolved = true; return new Response('nope'); } });
    expect(res.status).not.toBe(200);
    expect(resolved).toBe(false);
  });

  it('non-matching paths pass through to resolve()', async () => {
    const handle = buildHandle({ proxy: { upstream } });
    const { response } = await run(handle, 'https://site.example.com/about');
    expect(response.status).toBe(200);
  });

  it('proxy disabled by default: /api/clicktrail resolves normally', async () => {
    const handle = buildHandle();
    const { response } = await run(handle, 'https://site.example.com/api/clicktrail');
    expect(response.status).toBe(200);
  });

  it('rejects a proxy without an absolute upstream', () => {
    expect(() => buildHandle({ proxy: { upstream: 'not-a-url' } })).toThrow(/absolute http\(s\)/);
  });
});
