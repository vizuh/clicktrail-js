/**
 * buildChatwootAttributes: PURE builder. Deterministic output, ct_journey_id
 * + attribution summary + click IDs, empty values omitted, no I/O possible
 * (module has no transport/storage imports by construction).
 */
import { describe, expect, it } from 'vitest';
import {
  CHATWOOT_ATTRIBUTION_SUMMARY_KEYS,
  CHATWOOT_JOURNEY_ATTRIBUTE,
  buildChatwootAttributes,
} from '../src/conversation/chatwoot.js';

const PAYLOAD = {
  ft_channel: 'Google Ads',
  ft_source: 'google',
  ft_medium: 'cpc',
  ft_campaign: 'summer',
  ft_touch_timestamp: '2026-08-23T10:00:00.000Z',
  lt_channel: 'Direct',
  lt_source: '',
  gclid: 'abc-123',
  fbclid: '',
};

describe('buildChatwootAttributes', () => {
  it('is deterministic: identical inputs produce deep-equal maps', () => {
    const input = { journeyId: 'j-1', attribution: PAYLOAD };
    expect(buildChatwootAttributes(input)).toEqual(buildChatwootAttributes(input));
    expect(Object.keys(buildChatwootAttributes(input))).toEqual(
      Object.keys(buildChatwootAttributes(input)),
    );
  });

  it('carries ct_journey_id, summary keys, and click IDs verbatim', () => {
    const attrs = buildChatwootAttributes({ journeyId: 'j-1', attribution: PAYLOAD });
    expect(attrs[CHATWOOT_JOURNEY_ATTRIBUTE]).toBe('j-1');
    expect(attrs['ft_source']).toBe('google');
    expect(attrs['ft_channel']).toBe('Google Ads');
    expect(attrs['lt_channel']).toBe('Direct');
    expect(attrs['gclid']).toBe('abc-123');
    // absent/empty values are omitted, never emitted as ''
    expect(attrs['lt_source']).toBeUndefined();
    expect(attrs['fbclid']).toBeUndefined();
    expect(attrs['ttclid']).toBeUndefined();
  });

  it('omits ct_journey_id when the journey id is empty', () => {
    const attrs = buildChatwootAttributes({ journeyId: '', attribution: PAYLOAD });
    expect(CHATWOOT_JOURNEY_ATTRIBUTE in attrs).toBe(false);
  });

  it('exposes every summary key in stable order', () => {
    expect(CHATWOOT_ATTRIBUTION_SUMMARY_KEYS[0]).toBe('ft_channel');
    expect(CHATWOOT_ATTRIBUTION_SUMMARY_KEYS).toContain('ft_touch_timestamp');
    expect(CHATWOOT_ATTRIBUTION_SUMMARY_KEYS).toContain('lt_content');
  });
});
