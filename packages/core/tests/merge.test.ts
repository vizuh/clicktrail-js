import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyAttribution, extractClickIds, mergeAttributionTouch, stampVersions } from '../src/core/merge.js';
import type { ParsedTouch } from '../src/core/types.js';

function makeTouch(overrides: Partial<ParsedTouch> = {}): ParsedTouch {
  return {
    source: '', medium: '', campaign: '', term: '', content: '',
    utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
    referrer: '', landingPage: '', touchTimestamp: '2026-01-01T00:00:00Z',
    channel: 'direct' as never,
    channelLabel: '',
    clickIds: {},
    ...overrides,
  };
}

describe('mergeAttributionTouch laws', () => {
  it('first-touch is write-once; last-touch overwrites', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ source: 'first-src', medium: 'organic' }));
    stored = mergeAttributionTouch(stored, makeTouch({ source: 'second-src', medium: 'referral' }));
    expect(stored.ft_source).toBe('first-src');
    expect(stored.lt_source).toBe('second-src');
  });

  it('merging the same touch twice is idempotent', () => {
    const t = makeTouch({ source: 'google', medium: 'cpc' });
    const once = mergeAttributionTouch(emptyAttribution(), t);
    const twice = mergeAttributionTouch(once, t);
    expect(twice).toEqual(once);
  });

  it('never mutates its input (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (src) => {
        const stored = emptyAttribution();
        const snapshot = { ...stored };
        const next = mergeAttributionTouch(stored, makeTouch({ source: src }));
        expect(stored).toEqual(snapshot);
        return next !== stored;
      }),
    );
  });

  it('click IDs update to newest non-empty value; empty does not erase', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G1' } }));
    expect(stored.gclid).toBe('G1');
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G2' } }));
    expect(stored.gclid).toBe('G2');
    // A later touch without a click ID must NOT erase the stored one.
    stored = mergeAttributionTouch(stored, makeTouch({}));
    expect(stored.gclid).toBe('G2');
  });
});

describe('extractClickIds', () => {
  it('aliases sc_click_id -> sccid', () => {
    expect(extractClickIds('https://e.com/?sc_click_id=A1')).toEqual({ sccid: 'A1' });
  });
  it('returns {} for unparseable URLs instead of throwing', () => {
    expect(extractClickIds('::::not-a-url')).toEqual({});
  });
});

describe('first-touch guard counts click IDs (ruling #17)', () => {
  it('a stored ft_<clickid> (plugin-format payload) blocks later ft overwrites but still updates lt', () => {
    // Seed mirrors a payload migrated from the WP plugin, which stores ft_<clickid> keys.
    const seeded = { ...emptyAttribution(), ft_gclid: 'G-FIRST' };
    let stored = mergeAttributionTouch(seeded, makeTouch({ clickIds: { gclid: 'G2' } }));
    expect(stored.ft_source).toBe('');
    expect(stored.ft_gclid).toBe('G-FIRST');
    stored = mergeAttributionTouch(stored, makeTouch({ source: 'nl', medium: 'email', channelLabel: 'Unknown' }));
    expect(stored.ft_source).toBe('');
    expect(stored.ft_gclid).toBe('G-FIRST');
    expect(stored.lt_source).toBe('nl');
    expect(stored.ft_channel).toBe('');
    expect(stored.lt_channel).toBe('Unknown');
  });
});

describe('click-ID ft_/lt_ mirror (ruling B, runtime findings 2026-08-23)', () => {
  it('mirrors captured click IDs into ft_ and lt_ at write time', () => {
    const stored = mergeAttributionTouch(
      emptyAttribution(),
      makeTouch({ clickIds: { gclid: 'G1' } }),
    );
    expect(stored.ft_gclid).toBe('G1');
    expect(stored.lt_gclid).toBe('G1');
    expect(stored.gclid).toBe('G1');
  });

  it('an existing first touch blocks ft_ mirror rewrites; lt_ mirror follows', () => {
    const seeded = mergeAttributionTouch(
      emptyAttribution(),
      makeTouch({ source: 'g', medium: 'cpc', clickIds: { gclid: 'FIRST' } }),
    );
    const stored = mergeAttributionTouch(seeded, makeTouch({ clickIds: { gclid: 'SECOND' } }));
    expect(stored.ft_gclid).toBe('FIRST');
    expect(stored.lt_gclid).toBe('SECOND');
    expect(stored.gclid).toBe('SECOND');
  });

  it('empty click IDs never overwrite existing mirrored values', () => {
    const seeded = mergeAttributionTouch(
      emptyAttribution(),
      makeTouch({ source: 'g', medium: 'cpc', clickIds: { fbclid: 'F1' } }),
    );
    const stored = mergeAttributionTouch(seeded, makeTouch({ source: 'nl', medium: 'email' }));
    expect(stored.ft_fbclid).toBe('F1');
    expect(stored.lt_fbclid).toBe('F1');
  });
});

describe('browser IDs top-level (ruling A part a, runtime findings 2026-08-23)', () => {
  it('writes touch browserIds top-level, newest non-empty wins', () => {
    let stored = mergeAttributionTouch(
      emptyAttribution(),
      makeTouch({ source: 'fb', medium: 'cpc', browserIds: { fbp: 'fbp-1', ga_client_id: '123.456' } }),
    );
    expect(stored.fbp).toBe('fbp-1');
    expect(stored.ga_client_id).toBe('123.456');
    stored = mergeAttributionTouch(
      stored,
      makeTouch({ source: 'fb', medium: 'cpc', browserIds: { fbp: 'fbp-2' } }),
    );
    expect(stored.fbp).toBe('fbp-2');
    expect(stored.ga_client_id).toBe('123.456');
  });

  it('a touch without browserIds never clears existing values', () => {
    const seeded = mergeAttributionTouch(
      emptyAttribution(),
      makeTouch({ browserIds: { ttp: 'T1' } }),
    );
    const stored = mergeAttributionTouch(seeded, makeTouch({ source: 'nl', medium: 'email' }));
    expect(stored.ttp).toBe('T1');
  });
});

describe('stampVersions', () => {
  it('stamps both versions without mutating input', () => {
    const base = { foo: 'bar' };
    const out = stampVersions(base);
    expect(out.schema_version).toBe('1.2.0');
    expect(out.classifier_version).toBe('1.2.0');
    expect(base).toEqual({ foo: 'bar' });
  });
});
