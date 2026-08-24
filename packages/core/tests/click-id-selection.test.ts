/**
 * Hugo gate ruling D3: newest-valid-wins with full audit trail.
 */
import { describe, expect, it } from 'vitest';
import { emptyAttribution, mergeAttributionTouch } from '../src/core/merge.js';
import type { ParsedTouch } from '../src/core/types.js';

function makeTouch(overrides: Partial<ParsedTouch> = {}): ParsedTouch {
  return {
    source: '', medium: '', campaign: '', term: '', content: '',
    utmId: '', utmSourcePlatform: '', utmCreativeFormat: '', utmMarketingTactic: '',
    referrer: '', landingPage: '', touchTimestamp: '2026-08-23T10:00:00.000Z',
    channel: 'direct' as never,
    channelLabel: '',
    clickIds: {},
    ...overrides,
  };
}

function historyOf(payload: Record<string, string>): Array<{ k: string; v: string; t: string }> {
  return JSON.parse(payload.click_id_history ?? '[]');
}

describe('D3: newest-valid-wins', () => {
  it('top-level ID updates to the newest valid value', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G-1' }, touchTimestamp: '2026-08-23T10:00:00.000Z' }));
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G-2' }, touchTimestamp: '2026-08-23T11:00:00.000Z' }));
    expect(stored.gclid).toBe('G-2');
    expect(stored.attribution_selected_click_id).toBe('G-2');
    expect(stored.attribution_selected_click_id_reason).toBe('newest_valid_superseded_previous');
  });

  it('first-touch mirror keeps the ORIGINAL id; last-touch mirror keeps the LATEST', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G-FIRST' }, touchTimestamp: '2026-08-23T10:00:00.000Z' }));
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G-LATEST' }, touchTimestamp: '2026-08-23T11:00:00.000Z' }));
    expect(stored.ft_gclid).toBe('G-FIRST');
    expect(stored.lt_gclid).toBe('G-LATEST');
  });

  it('records the complete history with timestamps', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'A' }, touchTimestamp: '2026-08-23T10:00:00.000Z' }));
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { fbclid: 'B' }, touchTimestamp: '2026-08-23T11:00:00.000Z' }));
    const h = historyOf(stored);
    expect(h).toEqual([
      { k: 'gclid', v: 'A', t: '2026-08-23T10:00:00.000Z' },
      { k: 'fbclid', v: 'B', t: '2026-08-23T11:00:00.000Z' },
    ]);
  });

  it('empty values never overwrite or enter history', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'KEEP' } }));
    const before = stored.click_id_history;
    stored = mergeAttributionTouch(stored, makeTouch({}));
    expect(stored.gclid).toBe('KEEP');
    expect(stored.attribution_selected_click_id).toBe('KEEP');
    expect(historyOf(stored)).toHaveLength(1);
    expect(stored.click_id_history).toBe(before);
  });

  it('discards malformed stored history instead of failing (deterministic)', () => {
    const stored = emptyAttribution();
    stored.click_id_history = '{not-json';
    const next = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G' } }));
    expect(JSON.parse(next.click_id_history ?? '[]')).toEqual([{ k: 'gclid', v: 'G', t: '2026-08-23T10:00:00.000Z' }]);
    expect(next.attribution_selected_click_id).toBe('G');
  });

  it('caps history at the configured limit, dropping oldest first', () => {
    let stored = emptyAttribution();
    for (let i = 0; i < 60; i++) {
      stored = mergeAttributionTouch(
        stored,
        makeTouch({ clickIds: { gclid: `G-${i}` }, touchTimestamp: `2026-08-23T${String(i % 24).padStart(2, '0')}:00:00.000Z` }),
      );
    }
    const h = historyOf(stored);
    expect(h.length).toBeLessThanOrEqual(50);
    expect(String(h.at(-1)?.v)).toBe('G-59'); // newest always retained
  });

  it('selection reason is carried_over_valid when no new IDs arrive', () => {
    let stored = emptyAttribution();
    stored = mergeAttributionTouch(stored, makeTouch({ clickIds: { gclid: 'G' } }));
    const beforeReason = stored.attribution_selected_click_id_reason;
    stored = mergeAttributionTouch(stored, makeTouch({ source: 'nl', medium: 'email' }));
    expect(stored.gclid).toBe('G');
    expect(stored.attribution_selected_click_id_reason).toBe(beforeReason);
  });
});
