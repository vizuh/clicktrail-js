import { describe, expect, it } from 'vitest';
import { buildOperationEvent, safeParseJsonObject, EVENT_NAMES } from '../src/lib/events.js';
import { SCHEMA_VERSION, CLASSIFIER_VERSION } from '@vizuh/clicktrail-core';

describe('buildOperationEvent', () => {
  it('accepts every contract event name', () => {
    for (const name of EVENT_NAMES) {
      const event = buildOperationEvent({ eventName: name });
      expect(event['event_name']).toBe(name);
    }
  });

  it('rejects missing/blank eventName with TypeError (astro-style validation)', () => {
    expect(() => buildOperationEvent({ eventName: '' })).toThrow(TypeError);
    // @ts-expect-error deliberate bad input
    expect(() => buildOperationEvent({ eventName: 42 })).toThrow(TypeError);
  });

  it('stamps schema_version and classifier_version on every event', () => {
    const event = buildOperationEvent({ eventName: 'lead_created' });
    expect(event['schema_version']).toBe(SCHEMA_VERSION);
    expect(event['classifier_version']).toBe(CLASSIFIER_VERSION);
    expect(event.marketing_trail.schema_version).toBe(1);
  });

  it('threads siteId/workspaceId/consent into the marketing_trail envelope', () => {
    const event = buildOperationEvent({
      eventName: 'sale',
      payload: { lt_source: 'google', lt_medium: 'cpc' },
      siteId: 'site-1',
      workspaceId: 'ws-1',
      consent: { analytics: true, advertising: false },
    });
    expect(event.marketing_trail.site_id).toBe('site-1');
    expect(event.marketing_trail.workspace_id).toBe('ws-1');
    expect(event.marketing_trail.consent.analytics).toBe(true);
    expect(event.marketing_trail.consent.advertising).toBe(false);
    expect(event.marketing_trail.campaign === undefined || typeof event.marketing_trail.campaign === 'string').toBe(true);
  });

  it('merges caller data after payload and keeps inputs unmutated', () => {
    const payload = { visitor_id: 'v1' };
    const data = { value: 99 };
    const event = buildOperationEvent({ eventName: 'booking_created', payload, data });
    expect(payload).toEqual({ visitor_id: 'v1' });
    expect(data).toEqual({ value: 99 });
    expect(event['visitor_id']).toBe('v1');
    expect(event['value']).toBe(99);
  });

  it('never mutates through a shared data object reference', () => {
    const data: Record<string, unknown> = {};
    const a = buildOperationEvent({ eventName: 'lead_created', data });
    data.extra = 'x';
    const b = buildOperationEvent({ eventName: 'lead_created', data });
    expect(a).not.toBe(b);
    expect(b['extra']).toBe('x');
  });
});

describe('safeParseJsonObject', () => {
  it('parses valid JSON objects and rejects arrays/primitives/garbage', () => {
    expect(safeParseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJsonObject('[1]')).toBeNull();
    expect(safeParseJsonObject('"x"')).toBeNull();
    expect(safeParseJsonObject('{bad json')).toBeNull();
    expect(safeParseJsonObject('')).toBeNull();
    expect(safeParseJsonObject(undefined)).toBeNull();
    expect(safeParseJsonObject(null)).toBeNull();
    expect(safeParseJsonObject(42)).toBeNull();
  });

  it('returns empty object for empty-object string', () => {
    expect(safeParseJsonObject('{}')).toEqual({});
  });
});
