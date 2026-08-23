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

describe('stampVersions', () => {
  it('stamps both versions without mutating input', () => {
    const base = { foo: 'bar' };
    const out = stampVersions(base);
    expect(out.schema_version).toBe('1.0.0');
    expect(out.classifier_version).toBe('1.0.0');
    expect(base).toEqual({ foo: 'bar' });
  });
});
