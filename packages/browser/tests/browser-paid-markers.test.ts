/** Paid markers (#82) survive the storage and server-cookie allowlists. */
import { describe, expect, it } from 'vitest';
import { emptyAttribution, mergeAttributionTouch, parseAttributionUrl } from '@vizuh/clicktrail-core';
import { filterCanonical } from '../src/browser/payload-store.js';
import { buildMarketingTrailEnvelope, filterServerAttributionPayload } from '../src/browser/serialize.js';

const KEYS = [
  'gad_source', 'ft_gad_source', 'lt_gad_source',
  'gad_campaignid', 'ft_gad_campaignid', 'lt_gad_campaignid',
  'oppref', 'ft_oppref', 'lt_oppref',
];

function markerPayload() {
  const r = parseAttributionUrl({
    url: 'https://example.com/?gad_source=1&gad_campaignid=999&oppref=o1',
    now: '2026-11-14T10:00:00.000Z',
  });
  if (r.kind !== 'touch') throw new Error('expected touch');
  return mergeAttributionTouch(emptyAttribution(), r.touch);
}

describe('paid markers in allowlists', () => {
  it('filterCanonical keeps them', () => {
    const kept = filterCanonical(markerPayload());
    for (const key of KEYS) expect(kept[key], key).not.toBe(undefined);
    expect(kept.gad_source).toBe('1');
    expect(kept.oppref).toBe('o1');
  });

  it('the marketing_trail envelope never reports a marker as a click ID', () => {
    const envelope = buildMarketingTrailEnvelope(markerPayload(), 'lead.submitted', {});
    expect(envelope.click_ids).toEqual({});
  });

  it('filterServerAttributionPayload keeps them', () => {
    const kept = filterServerAttributionPayload(markerPayload());
    for (const key of KEYS) expect(kept[key], key).not.toBe(undefined);
    expect(kept.gad_campaignid).toBe('999');
  });
});
