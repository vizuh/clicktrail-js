import { describe, expect, it, vi } from 'vitest';
import {
  captureInitialAttribution,
  createClickTrailMiddleware,
  identityFromSharedMap,
  SHARED_MAP_KEY,
} from '../src/qwik-city-middleware.js';
import { ATTRIBUTION_KEY, LEGACY_ATTRIBUTION_KEY } from '@vizuh/clicktrail-browser';

interface Harness {
  url: string;
  headers: Headers;
  sharedMap: Map<string, unknown>;
  written: Map<string, { value: string; options?: Record<string, unknown> | undefined }>;
}

function makeHarness(url: string, cookieHeader = ''): Harness {
  const h: Harness = {
    url,
    headers: new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
    sharedMap: new Map(),
    written: new Map(),
  };
  return h;
}

function eventOf(h: Harness) {
  return {
    url: h.url,
    headers: h.headers,
    cookie: {
      get: (name: string) => h.written.get(name),
      set: (name: string, value: string, options?: Record<string, unknown>) => {
        h.written.set(name, { value, options });
      },
    },
    sharedMap: h.sharedMap,
  };
}

describe('captureInitialAttribution', () => {
  it('captures UTM signals into the request-local store', () => {
    const h = makeHarness('https://example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=launch');
    const result = captureInitialAttribution(eventOf(h));
    expect(result.captured).toBe(true);
    const payload = h.sharedMap.get(SHARED_MAP_KEY) as Record<string, string>;
    expect(payload['lt_source']).toBe('newsletter');
    expect(payload['lt_medium']).toBe('email');
    expect(payload['ft_landing_page']).toContain('/pricing');
  });

  it('captures bare click IDs (gclid) top-level without UTMs', () => {
    const h = makeHarness('https://example.com/?gclid=EAIaIQobChMIt');
    const result = captureInitialAttribution(eventOf(h));
    expect(result.captured).toBe(true);
    const payload = h.sharedMap.get(SHARED_MAP_KEY) as Record<string, string>;
    expect(payload['gclid']).toBe('EAIaIQobChMIt');
  });

  it('returns no_signal for plain URLs and stores nothing', () => {
    const h = makeHarness('https://example.com/about');
    const result = captureInitialAttribution(eventOf(h));
    expect(result.captured).toBe(false);
    expect(result.reason).toBe('no_signal');
    expect(h.sharedMap.has(SHARED_MAP_KEY)).toBe(false);
  });

  it('ignores same-site referrals as internal_referrer', () => {
    const h = makeHarness('https://example.com/target');
    const ev = eventOf(h) as ReturnType<typeof eventOf> & { headers: Headers };
    ev.headers.set('referer', 'https://example.com/source-page');
    const result = captureInitialAttribution(ev);
    expect(result.captured).toBe(false);
    expect(result.reason).toBe('internal_referrer');
  });

  it('external referrer infers an organic touch', () => {
    const h = makeHarness('https://example.com/article');
    const ev = eventOf(h) as ReturnType<typeof eventOf> & { headers: Headers };
    ev.headers.set('referer', 'https://www.google.com/');
    const result = captureInitialAttribution(ev);
    expect(result.captured).toBe(true);
    const payload = h.sharedMap.get(SHARED_MAP_KEY) as Record<string, string>;
    expect(payload['lt_source']).toBe('google');
  });

  it('persists to the attribution cookie when consent is granted', () => {
    const h = makeHarness(
      'https://example.com/?utm_source=paid',
      `${'ct_consent'}=granted`,
    );
    const result = captureInitialAttribution(eventOf(h));
    expect(result.persistedToCookie).toBe(true);
    const written = h.written.get(ATTRIBUTION_KEY);
    expect(written).toBeDefined();
    const decoded = JSON.parse(decodeURIComponent(written!.value)) as Record<string, string>;
    expect(decoded['lt_source']).toBe('paid');
    expect(written!.options).toMatchObject({ path: '/', sameSite: 'Lax' });
  });

  it('keeps capture request-local (no cookie write) while consent is absent or denied', () => {
    for (const header of ['', 'ct_consent=denied']) {
      const h = makeHarness('https://example.com/?utm_source=paid', header);
      const result = captureInitialAttribution(eventOf(h));
      expect(result.captured).toBe(true);
      expect(result.persistedToCookie).toBe(false);
      expect(h.written.has(ATTRIBUTION_KEY)).toBe(false);
      // memory-only store still usable for this-request conversions
      expect(h.sharedMap.has(SHARED_MAP_KEY)).toBe(true);
    }
  });

  it('persists regardless of consent when consentRequired is false', () => {
    const h = makeHarness('https://example.com/?utm_source=paid', '');
    const result = captureInitialAttribution(eventOf(h), { consentRequired: false });
    expect(result.persistedToCookie).toBe(true);
  });

  it('preserves first-touch history from a stored cookie and refreshes last-touch', () => {
    const stored = encodeURIComponent(JSON.stringify({
      ft_source: 'original', lt_source: 'original', ft_medium: 'cpc', lt_medium: 'cpc',
    }));
    const h = makeHarness(
      'https://example.com/?utm_source=second',
      `ct_consent=granted; ${ATTRIBUTION_KEY}=${stored}`,
    );
    captureInitialAttribution(eventOf(h));
    const written = h.written.get(ATTRIBUTION_KEY)!;
    const decoded = JSON.parse(decodeURIComponent(written.value)) as Record<string, string>;
    expect(decoded['ft_source']).toBe('original'); // write-once
    expect(decoded['lt_source']).toBe('second'); // refreshed
  });

  it('tolerates corrupt stored attribution cookies', () => {
    const h = makeHarness(
      'https://example.com/?utm_source=paid',
      `ct_consent=granted; ${LEGACY_ATTRIBUTION_KEY}=not-json{{`,
    );
    const result = captureInitialAttribution(eventOf(h));
    expect(result.captured).toBe(true);
  });

  it('reports the observed consent state per request', () => {
    const granted = captureInitialAttribution(eventOf(makeHarness('https://example.com/?utm_source=x', 'ct_consent=granted')));
    expect(granted.consentState).toBe(true);
    const absent = captureInitialAttribution(eventOf(makeHarness('https://example.com/?utm_source=x')));
    expect(absent.consentState).toBeNull();
  });
});

describe('createClickTrailMiddleware', () => {
  it('always continues the chain and forwards the next() result', async () => {
    const middleware = createClickTrailMiddleware();
    const h = makeHarness('https://example.com/?utm_source=x');
    const sentinel = { status: 200 };
    const next = vi.fn(async () => sentinel);
    const out = await middleware(eventOf(h), next);
    expect(out).toBe(sentinel);
    expect(next).toHaveBeenCalledTimes(1);
    expect(h.sharedMap.has(SHARED_MAP_KEY)).toBe(true);
  });

  it('swallows capture failures so analytics never breaks rendering', async () => {
    const middleware = createClickTrailMiddleware();
    const next = vi.fn(async () => 'ok');
    const hostileEvent = {
      url: 'https://example.com/?utm_source=x',
      headers: { get: () => { throw new Error('boom'); } },
      cookie: { get: () => undefined, set: () => undefined },
      sharedMap: new Map<string, unknown>(),
    };
    await expect(middleware(hostileEvent, next)).resolves.toBe('ok');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('identityFromSharedMap', () => {
  it('reads the captured payload back for route loaders/actions', () => {
    const h = makeHarness('https://example.com/?utm_source=nl');
    captureInitialAttribution(eventOf(h));
    const identity = identityFromSharedMap(h.sharedMap);
    expect(identity).not.toBeNull();
    expect(identity!.payload['lt_source']).toBe('nl');
  });

  it('returns null on an untouched map', () => {
    expect(identityFromSharedMap(new Map())).toBeNull();
  });
});
