import { describe, expect, it } from 'vitest';
import { HttpMethod } from '@activepieces/pieces-common';
import {
  ActionError,
  CLICKTRAIL_API_KEY_HEADER,
  DEFAULT_BASE_URL,
  buildEventsRequest,
  resolveBaseUrl,
} from '../src/lib/client.js';
import { buildActionEvent, buildIdentifyLead } from '../src/lib/events.js';

const EVENT = buildActionEvent(buildIdentifyLead({ email: 'a@b.co' }), { siteId: 'site-1' });

describe('resolveBaseUrl', () => {
  it('falls back to the hosted collector when unset or blank', () => {
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_BASE_URL);
    expect(resolveBaseUrl('   ')).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe('https://events.clicktrail.example');
  });

  it('uses the self-hosted override, trimmed', () => {
    expect(resolveBaseUrl('  https://ct.internal.example  ')).toBe('https://ct.internal.example');
  });
});

describe('auth/header wiring', () => {
  it('POSTs a single-event batch to <baseUrl> with the API key header', () => {
    const request = buildEventsRequest('https://ct.internal.example', 'sk-live-123', EVENT);
    expect(request.method).toBe(HttpMethod.POST);
    expect(request.timeout).toBe(3000);
    expect(request.url).toBe('https://ct.internal.example');
    expect(request.headers?.[CLICKTRAIL_API_KEY_HEADER]).toBe('sk-live-123');
    expect(request.headers?.['Content-Type']).toBe('application/json');

    const body = request.body as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toBe(EVENT);
  });

  it('header name contract is exactly X-ClickTrail-Key', () => {
    expect(CLICKTRAIL_API_KEY_HEADER).toBe('X-ClickTrail-Key');
  });
});

describe('ActionError surfacing', () => {
  it('includes the action displayName and status', () => {
    const error = new ActionError('Record Sale', 'event "sale.recorded" was not delivered (HTTP 401)', 401);
    expect(error.message).toContain('clicktrail Record Sale');
    expect(error.message).toContain('401');
    expect(error.actionDisplayName).toBe('Record Sale');
    expect(error.status).toBe(401);
    expect(error.name).toBe('ActionError');
  });

  it('defaults status to 0 for network-shaped failures', () => {
    const error = new ActionError('Track Event', 'socket hang up');
    expect(error.status).toBe(0);
  });
});
