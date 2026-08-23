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
});

describe('parseGaSessionDataValue (plugin parseGaSessionData port)', () => {
  it('reads GS2 tokens, GS1 dot format, then numeric fallback', () => {
    expect(parseGaSessionDataValue('GS1.1.1111111111.5')).toEqual({
      ga_session_id: '1111111111',
      ga_session_number: '5',
    });
    expect(parseGaSessionDataValue('other$s123456789$o3')).toEqual({
      ga_session_id: '123456789',
      ga_session_number: '3',
    });
    expect(parseGaSessionDataValue('')).toEqual({});
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
});
