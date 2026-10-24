/**
 * dataLayerDestination: pushes stamped payloads into an injected array,
 * creates its own array only inside start() — never on import — and keeps
 * Google tag field names and the canonical page_view out of the dataLayer
 * (push shape DATALAYER_VERSION 2.0.0).
 */
import { describe, expect, it } from 'vitest';
import {
  DATALAYER_VERSION,
  GOOGLE_TAG_RESERVED_FIELDS,
  dataLayerDestination,
} from '../src/browser/transport.js';
import { buildEventPayload } from '../src/browser/serialize.js';

/** Synthetic values for every reserved name, as caller data or payload. */
const RESERVED_INPUT = {
  session_id: 'sess-synthetic',
  client_id: '111.222',
  user_id: 'user-synthetic',
  session_number: '3',
  engagement_time_msec: 100,
  timestamp_micros: 1_700_000_000_000_000,
  page_location: 'https://example.test/landing',
  page_referrer: 'https://referrer.example.test/',
};

function pushed(dest: { getArray(): unknown[] }, index = 0): Record<string, unknown> {
  return dest.getArray()[index] as Record<string, unknown>;
}

describe('dataLayerDestination', () => {
  it('pushes events into a provided (injected) array in order', () => {
    const dataLayer: unknown[] = [];
    const dest = dataLayerDestination({ dataLayer });

    const e1 = buildEventPayload({ ft_source: 'google' }, 'lead.submitted');
    const e2 = buildEventPayload({ ft_source: 'google' }, 'cta_click');
    dest.deliver(e1);
    dest.deliver(e2);

    expect(dataLayer).toEqual([
      { ...e1, event: 'lead.submitted', datalayer_version: DATALAYER_VERSION },
      { ...e2, event: 'cta_click', datalayer_version: DATALAYER_VERSION },
    ]);
  });

  it('creates its backing array only when started (lazy, never at import)', () => {
    const dest = dataLayerDestination();
    expect(dest.getArray()).toEqual([]);

    dest.start?.();
    dest.deliver(buildEventPayload({}, 'lead_submitted'));
    expect(dest.getArray()).toHaveLength(1);
    expect(pushed(dest)['event']).toBe('lead_submitted');
  });

  it('pins the reserved Google tag field list', () => {
    expect([...GOOGLE_TAG_RESERVED_FIELDS]).toEqual([
      'session_id',
      'client_id',
      'user_id',
      'session_number',
      'engagement_time_msec',
      'timestamp_micros',
      'page_location',
      'page_referrer',
    ]);
    expect(DATALAYER_VERSION).toBe('2.0.0');
  });

  it('never pushes a reserved Google tag field name by default', () => {
    const dest = dataLayerDestination();
    dest.deliver(buildEventPayload(
      { session_id: 'payload-session', session_number: '1', visitor_id: 'visitor-synthetic' },
      'lead_submitted',
      RESERVED_INPUT,
    ));
    const push = pushed(dest);

    for (const field of GOOGLE_TAG_RESERVED_FIELDS) {
      expect(push).not.toHaveProperty(field);
      expect(push[`ct_${field}`]).toBe(RESERVED_INPUT[field]);
    }
    // Non-reserved canonical identity stays flat; nothing else is renamed.
    expect(push['visitor_id']).toBe('visitor-synthetic');
    expect(push).not.toHaveProperty('ct_visitor_id');
    expect(push['event_name']).toBe('lead_submitted');
  });

  it('renames canonical session identity from the stored payload', () => {
    const dest = dataLayerDestination();
    dest.deliver(buildEventPayload({ session_id: 'payload-session', session_number: '4' }, 'lead_submitted'));
    const push = pushed(dest);

    expect(push['ct_session_id']).toBe('payload-session');
    expect(push['ct_session_number']).toBe('4');
    expect(push).not.toHaveProperty('session_id');
    expect(push).not.toHaveProperty('session_number');
  });

  it('applies a configured prefix and lets the renamed value win', () => {
    const dest = dataLayerDestination({ reservedFieldPrefix: 'clicktrail_' });
    dest.deliver(buildEventPayload({}, 'lead_submitted', {
      session_id: 'sess-synthetic',
      clicktrail_session_id: 'caller-shadow',
    }));
    const push = pushed(dest);

    expect(push['clicktrail_session_id']).toBe('sess-synthetic');
    expect(push).not.toHaveProperty('session_id');
    expect(push).not.toHaveProperty('ct_session_id');
  });

  it('rejects an empty prefix, which would restore the collisions', () => {
    expect(() => dataLayerDestination({ reservedFieldPrefix: '' })).toThrow(TypeError);
  });

  it('leaves the marketing_trail envelope unchanged', () => {
    const event = buildEventPayload(
      { session_id: 'payload-session', lt_source: 'google', lt_medium: 'cpc' },
      'page_view',
      { page_location: 'https://example.test/landing' },
      { identity: { visitorId: 'visitor-synthetic' } },
    );
    const dest = dataLayerDestination();
    dest.deliver(event);

    expect(pushed(dest)['marketing_trail']).toEqual(event.marketing_trail);
  });

  it('pushes the canonical page_view as ct_page_view by default', () => {
    const dest = dataLayerDestination();
    dest.deliver(buildEventPayload({}, 'page_view'));
    const push = pushed(dest);

    expect(push['event']).toBe('ct_page_view');
    expect(push['event_name']).toBe('page_view');
    expect((push['marketing_trail'] as Record<string, unknown>)['event_name']).toBe('page_view');
    expect(dest.getArray().some((p) => (p as Record<string, unknown>)['event'] === 'page_view')).toBe(false);
  });

  it('uses a configured page view event name', () => {
    const dest = dataLayerDestination({ pageViewEvent: 'clicktrail.page_view' });
    dest.deliver(buildEventPayload({}, 'page_view'));
    dest.deliver(buildEventPayload({}, 'lead_submitted'));

    expect(pushed(dest, 0)['event']).toBe('clicktrail.page_view');
    expect(pushed(dest, 1)['event']).toBe('lead_submitted');
  });

  it('does not mutate the delivered event', () => {
    const event = buildEventPayload({ session_id: 'payload-session' }, 'page_view');
    const snapshot = structuredClone(event);
    dataLayerDestination().deliver(event);

    expect(event).toEqual(snapshot);
  });
});
