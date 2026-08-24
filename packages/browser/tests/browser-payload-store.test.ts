/**
 * Payload store: adapter round-trips, canonical allowlist, legacy alias
 * normalization (DATA-MODEL.md:123 evidence), tolerant reads.
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PAYLOAD_KEYS,
  LEGACY_KEY_ALIASES,
  filterCanonical,
  loadAttributionPayload,
  normalizeLegacyAliases,
  saveAttributionPayload,
} from '../src/browser/payload-store.js';
import { emptyAttribution } from '@vizuh/clicktrail-core';

function fakeAdapter(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v); },
    delete: (k: string) => { map.delete(k); },
  };
}

describe('LEGACY_KEY_ALIASES', () => {
  it('maps every documented first_* / last_* touch suffix to ft_*/lt_*', () => {
    expect(LEGACY_KEY_ALIASES['first_source']).toBe('ft_source');
    expect(LEGACY_KEY_ALIASES['last_source']).toBe('lt_source');
    expect(LEGACY_KEY_ALIASES['first_landing_page']).toBe('ft_landing_page');
    expect(LEGACY_KEY_ALIASES['last_touch_timestamp']).toBe('lt_touch_timestamp');
    expect(LEGACY_KEY_ALIASES['first_channel']).toBe('ft_channel');
    // Extended GA-style query fields are covered too (DATA-MODEL.md:124).
    expect(LEGACY_KEY_ALIASES['first_utm_marketing_tactic']).toBe('ft_utm_marketing_tactic');
    // No undocumented aliases sneak in.
    for (const target of Object.values(LEGACY_KEY_ALIASES)) {
      expect(CANONICAL_PAYLOAD_KEYS).toContain(target);
    }
  });
});

describe('normalizeLegacyAliases', () => {
  it('folds legacy aliases into absent canonical keys', () => {
    const out = normalizeLegacyAliases({ first_source: 'google', last_medium: 'cpc' });
    expect(out['ft_source']).toBe('google');
    expect(out['lt_medium']).toBe('cpc');
    expect(out['first_source']).toBeUndefined();
    expect(out['last_medium']).toBeUndefined();
  });

  it('a non-empty canonical value wins over its alias', () => {
    const out = normalizeLegacyAliases({
      first_source: 'legacy',
      ft_source: 'canonical',
    });
    expect(out['ft_source']).toBe('canonical');
    expect(out['first_source']).toBeUndefined();
  });

  it('an empty canonical value is replaced by the alias', () => {
    const out = normalizeLegacyAliases({ first_source: 'google', ft_source: '' });
    expect(out['ft_source']).toBe('google');
  });

  it('leaves payloads without aliases untouched', () => {
    const payload = { ...emptyAttribution(), gclid: 'g1' };
    expect(normalizeLegacyAliases(payload)).toEqual(payload);
  });
});

describe('filterCanonical', () => {
  it('ignores unknown keys and non-string values (schema-tolerant)', () => {
    const out = filterCanonical({
      ft_source: 'google',
      some_future_key: 'kept-by-newer-writer',
      numeric_future: 42,
      nested: { x: 1 },
    } as unknown as Record<string, string>);
    expect(out).toEqual({ ft_source: 'google' });
  });
});

describe('load/save round-trip through adapters', () => {
  it('saves and loads a full canonical payload unchanged', () => {
    const adapter = fakeAdapter();
    const payload = { ...emptyAttribution(), gclid: 'abc', ft_source: 'google' };
    saveAttributionPayload(adapter, payload);
    expect(loadAttributionPayload(adapter)).toEqual(payload);
  });

  it('returns {} on missing, corrupt, or non-object stored values', () => {
    const missing = fakeAdapter();
    expect(loadAttributionPayload(missing)).toEqual({});

    const corrupt = fakeAdapter({ attribution: '{not json' });
    expect(loadAttributionPayload(corrupt)).toEqual({});

    const array = fakeAdapter({ attribution: '[1,2]' });
    expect(loadAttributionPayload(array)).toEqual({});
  });

  it('normalizes legacy aliases on read only; saved output stays canonical', () => {
    const legacy = {
      first_source: 'facebook',
      last_campaign: 'spring',
      first_touch_timestamp: '2026-08-23T10:00:00.000Z',
    };
    const adapter = fakeAdapter({ attribution: JSON.stringify(legacy) });
    const loaded = loadAttributionPayload(adapter);
    expect(loaded['ft_source']).toBe('facebook');
    expect(loaded['lt_campaign']).toBe('spring');
    expect(loaded['ft_touch_timestamp']).toBe('2026-08-23T10:00:00.000Z');
    for (const key of Object.keys(loaded)) {
      expect(CANONICAL_PAYLOAD_KEYS).toContain(key);
    }
  });
});
