/**
 * Serialization: version stamps + payload mapping, replayed from a golden
 * fixture so the browser layer is tested against the executable spec.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { emptyAttribution, mergeAttributionTouch } from '../src/core/index.js';
import { SCHEMA_VERSION, CLASSIFIER_VERSION } from '../src/conventions/stable.js';
import { buildEventPayload } from '../src/browser/serialize.js';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const fixture = JSON.parse(
  readFileSync(join(fxDir, 'google-ads-utm-gclid.json'), 'utf8'),
) as { input: Parameters<typeof parseAttributionUrl>[0]; expected: Record<string, string> };

function payloadFromFixture() {
  const parsed = parseAttributionUrl(fixture.input);
  if (parsed.kind !== 'touch') throw new Error('fixture must produce a touch');
  return mergeAttributionTouch(emptyAttribution(), parsed.touch);
}

describe('buildEventPayload', () => {
  it('stamps schema_version and classifier_version on every event', () => {
    const event = buildEventPayload(payloadFromFixture(), 'page_view');
    expect(event.schema_version).toBe(SCHEMA_VERSION);
    expect(event.classifier_version).toBe(CLASSIFIER_VERSION);
  });

  it('maps the canonical flat payload through unchanged', () => {
    const payload = payloadFromFixture();
    const event = buildEventPayload(payload, 'page_view');
    for (const [key, value] of Object.entries(fixture.expected)) {
      if (key.startsWith('_')) continue; // classification metadata, not payload
      expect(event[key], key).toBe(value);
    }
    // Source payload is not mutated.
    expect(payload['schema_version']).toBeUndefined();
  });

  it('carries the event name and merges caller data (caller wins)', () => {
    const payload = payloadFromFixture();
    const event = buildEventPayload(payload, 'lead.submitted', {
      event_time: '2026-08-23T12:00:00Z',
      plan: 'pro',
    });
    expect(event['event_name']).toBe('lead.submitted');
    expect(event['event_time']).toBe('2026-08-23T12:00:00Z');
    expect(event['plan']).toBe('pro');
  });

  it('works on an empty canonical payload', () => {
    const event = buildEventPayload(emptyAttribution(), 'page_view');
    expect(event['event_name']).toBe('page_view');
    expect(event['ft_source']).toBe('');
    expect(Object.keys(event)).toContain('schema_version');
  });

  it('builds the normalized marketing trail envelope', () => {
    const event = buildEventPayload(
      {
        ...emptyAttribution(),
        visitor_id: 'visitor-1',
        ft_source: 'google',
        ft_medium: 'cpc',
        ft_campaign: 'botox_new_york',
        ft_landing_page: '/botox-consultation',
        ft_referrer: 'https://google.com/',
        gclid: 'gclid-1',
      },
      'lead.submitted',
      {
        event_id: 'evt_1',
        occurred_at: '2026-08-24T16:30:00Z',
        form_provider: 'elementor',
        form_id: 'consultation',
      },
      {
        workspaceId: 'ws_1',
        siteId: 'site_1',
        consent: { analytics: true, advertising: true },
        identity: { visitorId: 'visitor-1' },
      },
    );

    expect(event.marketing_trail).toEqual({
      schema_version: 1,
      event_id: 'evt_1',
      trail_id: 'trl_visitor-1',
      anonymous_id: 'anon_visitor-1',
      lead_id: 'lead_1',
      workspace_id: 'ws_1',
      site_id: 'site_1',
      event_name: 'lead_submitted',
      occurred_at: '2026-08-24T16:30:00Z',
      landing_page: '/botox-consultation',
      referrer: 'https://google.com/',
      source: 'google',
      medium: 'cpc',
      campaign: 'botox_new_york',
      click_ids: { gclid: 'gclid-1' },
      consent: { analytics: true, advertising: true },
      form: { provider: 'elementor', form_id: 'consultation' },
    });
  });
});
