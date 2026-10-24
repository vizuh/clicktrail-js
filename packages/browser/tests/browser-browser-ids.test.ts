import { describe, expect, it } from 'vitest';
import {
  applyBrowserIdentifiers,
  collectBrowserIdsFromCookies,
  parseCookieMap,
  parseGaSessionDataValue,
} from '../src/browser/browser-ids.js';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import type { Destination } from '../src/browser/transport.js';
import type { CookieJar } from '../src/browser/storage.js';

const NO_DEST: Destination[] = [];

describe('parseCookieMap', () => {
  it('parses a raw cookie header with lowercased names and URI decoding', () => {
    expect(parseCookieMap('_fbp=fb.1.1.2; _ga=GA1.1.1234567890.9876543210; bad; x=a%20b')).toEqual({
      _fbp: 'fb.1.1.2',
      _ga: 'GA1.1.1234567890.9876543210',
      x: 'a b',
    });
  });

  // Order as Chrome lists it: longer path first, then older first (RFC 6265 §5.4).
  const TWO_GA = '_ga=GA1.1.1.100; _ga=GA1.1.2.200';

  it('keeps the last duplicate by default and the first with duplicates: first', () => {
    expect(parseCookieMap(TWO_GA)).toEqual({ _ga: 'GA1.1.2.200' });
    expect(parseCookieMap(TWO_GA, { duplicates: 'last' })).toEqual({ _ga: 'GA1.1.2.200' });
    expect(parseCookieMap(TWO_GA, { duplicates: 'first' })).toEqual({ _ga: 'GA1.1.1.100' });
    expect(collectBrowserIdsFromCookies(parseCookieMap(TWO_GA, { duplicates: 'first' }))).toEqual({
      ga_client_id: '1.100',
    });
    expect(collectBrowserIdsFromCookies(parseCookieMap(TWO_GA))).toEqual({ ga_client_id: '2.200' });
  });

  it('rejects an unknown duplicates policy', () => {
    expect(() => parseCookieMap('', { duplicates: 'newest' as never })).toThrow(TypeError);
  });

  it('reports differing duplicates of tracked browser-ID cookies once per call, names only', () => {
    const reported: Array<{ code: string; context?: Record<string, unknown> }> = [];
    const sink = { report: (d: { code: string; context?: Record<string, unknown> }) => reported.push(d) };
    parseCookieMap(
      `${TWO_GA}; _ga_ABC123=GS2.1.s1111111111; _ga_ABC123=GS2.1.s2222222222; ` +
        '_fbp=fb.1.1.1; _fbp=fb.1.1.1; _fbc=fb.1.1.a; _fbc=fb.1.1.b; x=1; x=2',
      { duplicates: 'first', sink },
    );
    expect(reported).toEqual([
      expect.objectContaining({
        code: 'browser_id_cookie_duplicate',
        level: 'warn',
        context: { cookie_names: '_ga,_ga_abc123,_fbc', duplicates: 'first' },
      }),
    ]);

    // Identical values, untracked names, or a single occurrence stay silent.
    parseCookieMap('_fbp=fb.1.1.1; _fbp=fb.1.1.1; x=1; x=2; _ga=GA1.1.1.100', { sink });
    expect(reported).toHaveLength(1);
  });
});

// Synthetic GA4 cookie values in the shapes gtag writes (no real property IDs).
const GS1_VALUE = 'GS1.1.1111111111.5.1.1111111200.0.0.0';
const GS2_OTHER = 'GS2.1.s1111111111$o4$g1$t1111111200$j60$l0$h0';
const GS2_PINNED = 'GS2.1.s2222222222$o7$g0$t2222222300$j60$l0$h0';

describe('parseGaSessionDataValue (plugin parseGaSessionData port, #47 deviations)', () => {
  it('reads GS1 dot fields', () => {
    expect(parseGaSessionDataValue(GS1_VALUE)).toEqual({
      ga_session_id: '1111111111',
      ga_session_number: '5',
    });
    expect(parseGaSessionDataValue('GS1.1.1111111111.5')).toEqual({
      ga_session_id: '1111111111',
      ga_session_number: '5',
    });
  });

  it('reads GS2 tokens after the GS2.<n>. prefix, including the leading s token', () => {
    expect(parseGaSessionDataValue(GS2_PINNED)).toEqual({
      ga_session_id: '2222222222',
      ga_session_number: '7',
    });
    expect(parseGaSessionDataValue('GS2.1.s2222222222')).toEqual({ ga_session_id: '2222222222' });
  });

  it('yields nothing for non-GS values (numeric-token fallback removed)', () => {
    expect(parseGaSessionDataValue('foo123bar456')).toEqual({});
    expect(parseGaSessionDataValue('other$s123456789$o3')).toEqual({});
    expect(parseGaSessionDataValue('GS3.1.s2222222222$o7')).toEqual({});
    expect(parseGaSessionDataValue('')).toEqual({});
  });

  it('rejects malformed GS1/GS2 fields instead of guessing', () => {
    expect(parseGaSessionDataValue('GS1.1')).toEqual({});
    expect(parseGaSessionDataValue('GS1.1.abc.5')).toEqual({ ga_session_number: '5' });
    expect(parseGaSessionDataValue('GS2.1.s12$o3')).toEqual({ ga_session_number: '3' });
  });
});

describe('collectBrowserIdsFromCookies (ruling A part b)', () => {
  it('collects cookie-derived IDs only, canonical keys only', () => {
    const ids = collectBrowserIdsFromCookies(parseCookieMap(
      '_fbp=fbp-cookie; _ttp=ttp-cookie; li_gc=li-value; ' +
      '_ga=GA1.1.1234567890.9876543210; _ga_ABC123=GS1.1.1111111111.5',
    ));
    expect(ids).toEqual({
      fbp: 'fbp-cookie',
      ttp: 'ttp-cookie',
      li_gc: 'li-value',
      ga_client_id: '1234567890.9876543210',
      ga_session_id: '1111111111',
      ga_session_number: '5',
    });
  });

  it('returns nothing without relevant cookies', () => {
    expect(collectBrowserIdsFromCookies(parseCookieMap('other=x'))).toEqual({});
  });

  it('reads a GS2 session cookie', () => {
    expect(collectBrowserIdsFromCookies(parseCookieMap(`_ga_ABC123=${GS2_PINNED}`))).toEqual({
      ga_session_id: '2222222222',
      ga_session_number: '7',
    });
  });

  it('reads only the configured property cookie when ga4MeasurementId is set', () => {
    const cookies = parseCookieMap(`_ga_OTHER=${GS2_OTHER}; _ga_ABC123=${GS2_PINNED}`);
    const reported: string[] = [];
    const ids = collectBrowserIdsFromCookies(cookies, {
      ga4MeasurementId: 'G-ABC123',
      sink: { report: (d) => reported.push(d.code) },
    });
    expect(ids).toEqual({ ga_session_id: '2222222222', ga_session_number: '7' });
    expect(reported).toEqual([]);
  });

  it('uses configured order across several measurement IDs and never falls back to others', () => {
    const cookies = parseCookieMap(`_ga_OTHER=${GS2_OTHER}; _ga_ABC123=${GS2_PINNED}`);
    expect(
      collectBrowserIdsFromCookies(cookies, { ga4MeasurementId: ['G-MISSING1', 'g-abc123'] }),
    ).toEqual({ ga_session_id: '2222222222', ga_session_number: '7' });
    expect(collectBrowserIdsFromCookies(cookies, { ga4MeasurementId: 'G-MISSING1' })).toEqual({});
  });

  it('rejects invalid measurement IDs', () => {
    const cookies = parseCookieMap(`_ga_ABC123=${GS2_PINNED}`);
    expect(() => collectBrowserIdsFromCookies(cookies, { ga4MeasurementId: 'ABC123' })).toThrow(TypeError);
    expect(() => collectBrowserIdsFromCookies(cookies, { ga4MeasurementId: 'G-' })).toThrow(TypeError);
    expect(() => collectBrowserIdsFromCookies(cookies, { ga4MeasurementId: [] })).toThrow(TypeError);
  });

  it('reports ga_session_property_unpinned when unpinned with several _ga_* cookies', () => {
    const reported: Array<{ code: string; context?: Record<string, unknown> }> = [];
    const sink = { report: (d: { code: string; context?: Record<string, unknown> }) => reported.push(d) };
    const ids = collectBrowserIdsFromCookies(
      parseCookieMap(`_ga_OTHER=${GS2_OTHER}; _ga_ABC123=${GS2_PINNED}`),
      { sink },
    );
    // Unpinned behaviour is unchanged: first usable cookie wins.
    expect(ids).toEqual({ ga_session_id: '1111111111', ga_session_number: '4' });
    expect(reported).toEqual([
      expect.objectContaining({
        code: 'ga_session_property_unpinned',
        context: { ga_session_cookie_count: 2 },
      }),
    ]);

    collectBrowserIdsFromCookies(parseCookieMap(`_ga_ABC123=${GS2_PINNED}`), { sink });
    expect(reported).toHaveLength(1);
  });

  it('skips non-GS and session-number-only values when choosing the unpinned cookie', () => {
    expect(collectBrowserIdsFromCookies(parseCookieMap('_ga_X=foo123bar456'))).toEqual({});
    expect(
      collectBrowserIdsFromCookies(parseCookieMap(`_ga_X=foo123bar456; _ga_Y=GS2.1.$o3; _ga_ABC123=${GS1_VALUE}`)),
    ).toEqual({ ga_session_id: '1111111111', ga_session_number: '5' });
  });
});

describe('applyBrowserIdentifiers law', () => {
  it('overwrites non-empty differing values and keeps the reference when unchanged', () => {
    const payload = { fbp: 'old' };
    expect(applyBrowserIdentifiers(payload, { fbp: 'new' })).toEqual({ fbp: 'new' });
    expect(applyBrowserIdentifiers(payload, { fbp: 'old' })).toBe(payload);
    expect(applyBrowserIdentifiers(payload, {})).toBe(payload);
  });
});

function fakeJar(raw: string): CookieJar {
  return { read: () => raw, write: () => {} };
}

describe('createClickTrail cookie browser-ID gating', () => {
  it('merges cookie-derived IDs top-level on start() behind the consent gate', () => {
    const jar = fakeJar('_fbp=fbp-cookie');
    const allowed = createClickTrail({
      destinations: NO_DEST,
      storage: { browserIdCookieJar: jar },
    });
    allowed.start();
    expect(allowed.getField('fbp')).toBe('fbp-cookie');

    const denied = createClickTrail({
      destinations: NO_DEST,
      consentGate: () => false,
      storage: { browserIdCookieJar: jar },
    });
    denied.start();
    // Consent denied -> no cookie read at all.
    expect(denied.getField('fbp')).toBe('');
  });

  it('refreshes cookie-derived IDs on capture (mergeParsedTouch)', () => {
    let header = '_fbp=first';
    const dynJar: CookieJar = { read: () => header, write: () => {} };
    const ct = createClickTrail({ destinations: NO_DEST, storage: { browserIdCookieJar: dynJar } });
    ct.start();
    expect(ct.getField('fbp')).toBe('first');
    header = '_fbp=second';
    ct.mergeParsedTouch({
      source: 'nl', medium: 'email', campaign: '', term: '', content: '',
      utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
      referrer: '', landingPage: '', touchTimestamp: '2026-08-23T10:00:00.000Z',
      channel: 'email' as never, channelLabel: 'Unknown', clickIds: {},
    });
    expect(ct.getField('fbp')).toBe('second');
  });

  const TWO_PROPERTIES = `_ga_OTHER=${GS2_OTHER}; _ga_ABC123=${GS2_PINNED}`;
  const touch = {
    source: 'nl', medium: 'email', campaign: '', term: '', content: '',
    utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
    referrer: '', landingPage: '', touchTimestamp: '2026-08-23T10:00:00.000Z',
    channel: 'email' as never, channelLabel: 'Unknown', clickIds: {},
  };

  it('threads ga4MeasurementId to the GA session cookie read', () => {
    const reported: string[] = [];
    const ct = createClickTrail({
      destinations: NO_DEST,
      ga4MeasurementId: 'G-ABC123',
      diagnosticSink: { report: (d) => reported.push(d.code) },
      storage: { browserIdCookieJar: fakeJar(TWO_PROPERTIES) },
    });
    ct.start();
    expect(ct.getField('ga_session_id')).toBe('2222222222');
    expect(ct.getField('ga_session_number')).toBe('7');
    expect(reported).toEqual([]);
  });

  it('reports the unpinned ambiguity once per instance', () => {
    const reported: string[] = [];
    const ct = createClickTrail({
      destinations: NO_DEST,
      diagnosticSink: { report: (d) => reported.push(d.code) },
      storage: { browserIdCookieJar: fakeJar(TWO_PROPERTIES) },
    });
    ct.start();
    ct.mergeParsedTouch(touch);
    expect(ct.getField('ga_session_id')).toBe('1111111111');
    expect(reported).toEqual(['ga_session_property_unpinned']);
  });

  it('keeps browser IDs when the diagnostic sink throws', () => {
    const ct = createClickTrail({
      destinations: NO_DEST,
      diagnosticSink: { report: () => { throw new Error('sink failed'); } },
      storage: { browserIdCookieJar: fakeJar(`_fbp=fbp-cookie; ${TWO_PROPERTIES}`) },
    });
    ct.start();
    expect(ct.getField('fbp')).toBe('fbp-cookie');
    expect(ct.getField('ga_session_id')).toBe('1111111111');
  });

  it('throws at construction for an invalid ga4MeasurementId', () => {
    expect(() => createClickTrail({ destinations: NO_DEST, ga4MeasurementId: 'UA-1234-1' })).toThrow(TypeError);
    expect(() => createClickTrail({ destinations: NO_DEST, ga4MeasurementId: [] })).toThrow(TypeError);
  });

  it('reads the first duplicate browser-ID cookie by default; last on request', () => {
    const jar = fakeJar('_ga=GA1.1.1.100; _ga=GA1.1.2.200');
    const first = createClickTrail({ destinations: NO_DEST, storage: { browserIdCookieJar: jar } });
    first.start();
    expect(first.getField('ga_client_id')).toBe('1.100');

    const last = createClickTrail({
      destinations: NO_DEST,
      browserIdCookieDuplicates: 'last',
      storage: { browserIdCookieJar: jar },
    });
    last.start();
    expect(last.getField('ga_client_id')).toBe('2.200');
  });

  it('reports browser_id_cookie_duplicate once per instance, independent of other codes', () => {
    const reported: string[] = [];
    const ct = createClickTrail({
      destinations: NO_DEST,
      diagnosticSink: { report: (d) => reported.push(d.code) },
      storage: {
        browserIdCookieJar: fakeJar(`_fbp=fb.1.1.100; _fbp=fb.1.1.200; ${TWO_PROPERTIES}`),
      },
    });
    ct.start();
    ct.mergeParsedTouch(touch);
    expect(ct.getField('fbp')).toBe('fb.1.1.100');
    expect(reported).toEqual(['browser_id_cookie_duplicate', 'ga_session_property_unpinned']);
  });

  it('throws at construction for an invalid browserIdCookieDuplicates', () => {
    expect(() =>
      createClickTrail({ destinations: NO_DEST, browserIdCookieDuplicates: 'newest' as never }),
    ).toThrow(TypeError);
  });
});
