import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORMBRICKS_FIELDS,
  decorateFormbricksSurveyUrl,
  parseFormbricksWebhook,
  toClickTrailLead,
} from '../src/index.js';

describe('Formbricks URL and response mapping', () => {
  it('preserves existing query state and only forwards the default allowlist', () => {
    const result = decorateFormbricksSurveyUrl(
      'https://survey.example/s/demo?source=linkedin#start',
      {
        ft_source: 'google',
        ft_campaign: 'brand',
        gclid: 'gclid-123',
        session_id: 'do-not-forward',
      },
    );

    const url = new URL(result);
    expect(url.searchParams.get('source')).toBe('linkedin');
    expect(url.searchParams.get('ct_ft_source')).toBe('google');
    expect(url.searchParams.get('ct_ft_campaign')).toBe('brand');
    expect(url.searchParams.has('ct_gclid')).toBe(false);
    expect(url.searchParams.has('ct_session_id')).toBe(false);
    expect(url.hash).toBe('#start');

    const explicitClickId = decorateFormbricksSurveyUrl(
      'https://survey.example/s/demo',
      { gclid: 'gclid-123' },
      { fields: [...DEFAULT_FORMBRICKS_FIELDS, 'gclid'] },
    );
    expect(new URL(explicitClickId).searchParams.get('ct_gclid')).toBe('gclid-123');
  });

  it('rejects unsafe schemes and sanitizes forwarded values', () => {
    expect(() => decorateFormbricksSurveyUrl('javascript:alert(1)', {})).toThrow(/http\(s\)/);
    expect(() => decorateFormbricksSurveyUrl('//evil.example/s/demo', {})).toThrow(/relative URL/);

    const result = decorateFormbricksSurveyUrl('https://survey.example/s/demo', {
      ft_source: ' google\n',
      ft_campaign: '{{campaign.name}}',
    });
    const url = new URL(result);
    expect(url.searchParams.get('ct_ft_source')).toBe('google');
    expect(url.searchParams.has('ct_ft_campaign')).toBe(false);
  });

  it('maps only finished responses into a stable ClickTrail lead', () => {
    const webhook = parseFormbricksWebhook({
      webhookId: 'webhook-1',
      event: 'responseFinished',
      data: {
        id: 'response-1',
        surveyId: 'survey-1',
        createdAt: '2026-08-25T10:00:00.000Z',
        contactId: 'contact-1',
        data: {
          ct_ft_source: 'google',
          ct_lt_campaign: 'brand',
          ct_gclid: 'gclid-123',
          ct_session_id: 'do-not-forward',
        },
      },
    });

    const mapping = toClickTrailLead(webhook, {
      siteId: 'site-1',
      fields: [...DEFAULT_FORMBRICKS_FIELDS, 'gclid'],
    });
    expect(mapping).not.toBeNull();
    expect(mapping?.identity.payload).toEqual({
      ft_source: 'google',
      lt_campaign: 'brand',
      gclid: 'gclid-123',
    });
    expect(mapping?.eventId).toBe('evt_s-f33c73796edafdb78438305cb81d747c');
    expect(mapping?.data).toMatchObject({
      event_id: 'evt_s-f33c73796edafdb78438305cb81d747c',
      form_id: 'survey-1',
      lead_id: 'response-1',
      contact_id: 'contact-1',
      site_id: 'site-1',
    });
    expect(toClickTrailLead({ ...webhook, event: 'responseCreated' }, { siteId: 'site-1' })).toBeNull();
  });

  it('rejects malformed webhook payloads', () => {
    expect(() => parseFormbricksWebhook({ event: 'responseFinished', data: {} })).toThrow(
      'formbricks.data.id',
    );
    expect(() => parseFormbricksWebhook({
      event: 'responseFinished',
      data: { id: 1, surveyId: 'survey-1' },
    })).toThrow('formbricks.data.id');
  });
});
