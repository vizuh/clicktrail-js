/**
 * gad_source / gad_campaignid / oppref are paid markers (#82): touch signals
 * that classify and are stored like click IDs, but are never click IDs, so
 * they never reach click-ID selection or history.
 */
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { emptyAttribution, mergeAttributionTouch } from '../src/core/merge.js';
import type { ParsedTouch } from '../src/core/types.js';

const NOW = '2026-11-14T10:00:00.000Z';

function touchOf(url: string, referrer = '', extra: Record<string, unknown> = {}): ParsedTouch {
  const r = parseAttributionUrl({ url, referrer, currentHost: 'example.com', now: NOW, ...extra });
  if (r.kind !== 'touch') throw new Error(`expected touch, got ${r.reason}`);
  return r.touch;
}

describe('paid markers (#82)', () => {
  it('gad_source from google.com is Google Ads paid, stored, and not a click ID', () => {
    const touch = touchOf('https://example.com/?gad_source=1&gad_campaignid=999', 'https://www.google.com/');
    expect(touch.channelLabel).toBe('Google Ads');
    expect(touch.channel).toBe('paid_search');
    expect(touch.source).toBe('google');
    expect(touch.medium).toBe('cpc');
    expect(touch.clickIds).toEqual({});

    const payload = mergeAttributionTouch(emptyAttribution(), touch);
    expect(payload.ft_channel).toBe('Google Ads');
    expect(payload.lt_channel).toBe('Google Ads');
    for (const key of ['gad_source', 'ft_gad_source', 'lt_gad_source']) expect(payload[key], key).toBe('1');
    for (const key of ['gad_campaignid', 'ft_gad_campaignid', 'lt_gad_campaignid']) expect(payload[key], key).toBe('999');
    expect(payload.attribution_selected_click_id).toBe('');
    expect(payload.click_id_history).toBe('[]');
  });

  it('oppref from chatgpt.com is ChatGPT Ads paid, stored, and not a click ID', () => {
    const touch = touchOf('https://example.com/?oppref=abc123', 'https://chatgpt.com/');
    expect(touch.channelLabel).toBe('ChatGPT Ads');
    expect(touch.channel).toBe('paid_other');
    expect(touch.source).toBe('chatgpt');
    expect(touch.medium).toBe('cpc');
    expect(touch.clickIds).toEqual({});

    const payload = mergeAttributionTouch(emptyAttribution(), touch);
    expect(payload.ft_channel).toBe('ChatGPT Ads');
    for (const key of ['oppref', 'ft_oppref', 'lt_oppref']) expect(payload[key], key).toBe('abc123');
    expect(payload.attribution_selected_click_id).toBe('');
    expect(payload.click_id_history).toBe('[]');
  });

  it('a real click ID stays the selected one next to a marker', () => {
    const touch = touchOf('https://example.com/?gclid=G1&gad_source=1');
    const payload = mergeAttributionTouch(emptyAttribution(), touch);
    expect(payload.attribution_selected_click_id).toBe('G1');
    expect(JSON.parse(payload.click_id_history!)).toEqual([{ k: 'gclid', v: 'G1', t: NOW }]);
    expect(payload.gad_source).toBe('1');
  });

  it('gad_source outranks an uncertain click ID for the paid classification', () => {
    const touch = touchOf('https://example.com/?fbclid=F1&gad_source=1');
    expect(touch.channelLabel).toBe('Google Ads');
    expect(touch.channel).toBe('paid_search');
  });

  it('gad_campaignid alone is stored but does not classify as paid', () => {
    const touch = touchOf('https://example.com/?gad_campaignid=999');
    expect(touch.channel).toBe('unknown');
    expect(touch.channelLabel).toBe('Unknown');
    expect(touch.paidMarkers).toEqual({ gad_campaignid: '999' });
  });

  it('a first touch holding only a marker is not overwritten', () => {
    let payload = mergeAttributionTouch(emptyAttribution(), touchOf('https://example.com/?gad_campaignid=999'));
    payload = mergeAttributionTouch(payload, touchOf('https://example.com/?utm_source=news&utm_medium=email'));
    expect(payload.ft_gad_campaignid).toBe('999');
    expect(payload.lt_source).toBe('news');
  });

  it('signalKeys.clickIds gates markers like click IDs', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/?gad_source=1&oppref=o1',
      now: NOW,
      signalKeys: { clickIds: ['gclid'] },
    });
    expect(r).toEqual({ kind: 'none', reason: 'no_signal' });
    const kept = touchOf('https://example.com/?gad_source=1&oppref=o1', '', {
      signalKeys: { clickIds: ['gclid', 'gad_source'] },
    });
    expect(kept.paidMarkers).toEqual({ gad_source: '1' });
  });

  it('clearLastTouchClickIds also clears a stale lt_ marker', () => {
    let payload = mergeAttributionTouch(emptyAttribution(), touchOf('https://example.com/?gad_source=1'));
    payload = mergeAttributionTouch(payload, touchOf('https://example.com/?utm_source=news&utm_medium=email'), {
      clearLastTouchClickIds: true,
    });
    expect(payload.lt_gad_source).toBe('');
    expect(payload.ft_gad_source).toBe('1');
  });

  it('path+allowlisted-query landing pages keep the markers', () => {
    const touch = touchOf('https://example.com/lp?gad_source=1&email=a@b.co', '', {
      landingPageFormat: 'path+allowlisted-query',
    });
    expect(touch.landingPage).toBe('/lp?gad_source=1');
  });
});
