/**
 * Outbound event serialization.
 *
 * Builds the wire/event payload from the canonical flat AttributionPayload.
 * Every outbound event ALWAYS carries `schema_version` + `classifier_version`
 * (via core's {@link stampVersions}). Deterministic: the caller supplies any
 * timestamp through the optional `data` bag (e.g. `event_time`).
 */
import { stampVersions } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';

export interface MarketingTrailEnvelope {
  schema_version: 1;
  event_id: string;
  trail_id: string;
  anonymous_id: string;
  lead_id: string;
  workspace_id: string;
  site_id: string;
  event_name: string;
  occurred_at: string;
  landing_page: string;
  referrer: string;
  source: string;
  medium: string;
  campaign: string;
  click_ids: Record<string, string>;
  consent: { analytics: boolean; advertising: boolean };
  form: { provider: string; form_id: string };
}

export interface MarketingTrailContext {
  workspaceId?: string;
  siteId?: string;
  identity?: { visitorId?: string };
  consent?: { analytics?: boolean; advertising?: boolean; marketing?: boolean };
}

/** Common stamped event shape accepted by every destination. */
export type StampedClickTrailEvent = Record<string, unknown> & {
  event_name: string;
  schema_version: string;
  classifier_version: string;
};

/**
 * A browser-serialized ClickTrail event.
 * Flat shape: `event_name`, all canonical payload keys, caller data,
 * marketing envelope, then version stamps last-writer-wins.
 */
export type ClickTrailEvent = StampedClickTrailEvent & {
  marketing_trail: MarketingTrailEnvelope;
};

const CLICK_ID_KEYS = [
  'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid', 'twclid',
  'li_fat_id', 'sccid', 'epik',
] as const;

const SERVER_RESERVED_KEYS = [
  '__proto__',
  'event_id',
  'event_name',
  'marketing_trail',
  'site_id',
  'workspace_id',
  'visitor_id',
  'session_id',
  'session_number',
  'trail_id',
  'anonymous_id',
] as const;

export function sanitizeServerEventInput<T extends Record<string, unknown>>(input: T): T {
  const sanitized: Record<string, unknown> = { ...input };
  for (const key of SERVER_RESERVED_KEYS) delete sanitized[key];
  return sanitized as T;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
}

function prefixed(value: unknown, prefix: string): string {
  const candidate = text(value);
  if (!candidate) return '';
  return candidate.startsWith(prefix) ? candidate : `${prefix}${candidate}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function touchValue(payload: AttributionPayload, key: string, data: Record<string, unknown>): string {
  return firstText(data[key], payload[`lt_${key}`], payload[`ft_${key}`], payload[key]);
}

function canonicalEventName(eventName: string): string {
  return ['lead', 'lead.submitted', 'lead_submitted', 'form_submission'].includes(eventName)
    ? 'lead_submitted'
    : eventName;
}

export function buildMarketingTrailEnvelope(
  payload: AttributionPayload,
  eventName: string,
  data: Record<string, unknown> = {},
  context: MarketingTrailContext = {},
): MarketingTrailEnvelope {
  const supplied = isRecord(data['marketing_trail']) ? data['marketing_trail'] : {};
  const visitorId = firstText(context.identity?.visitorId, data['visitor_id'], payload['visitor_id']);
  const anonymousId = prefixed(firstText(supplied['anonymous_id'], data['anonymous_id'], visitorId), 'anon_');
  const eventId = prefixed(firstText(supplied['event_id'], data['event_id']), 'evt_');
  const leadEvent = ['lead', 'lead.submitted', 'lead_submitted', 'form_submission'].includes(eventName);
  const leadId = prefixed(
    firstText(supplied['lead_id'], data['lead_id'], leadEvent ? eventId.replace(/^evt_/, '') : ''),
    'lead_',
  );
  const clickIds: Record<string, string> = {};
  const suppliedClickIds = isRecord(supplied['click_ids']) ? supplied['click_ids'] : {};
  const dataClickIds = isRecord(data['click_ids']) ? data['click_ids'] : {};
  for (const key of CLICK_ID_KEYS) {
    const value = firstText(
      suppliedClickIds[key],
      dataClickIds[key],
      payload[key],
      payload[`lt_${key}`],
      payload[`ft_${key}`],
    );
    if (value) clickIds[key] = value;
  }

  const suppliedForm = isRecord(supplied['form']) ? supplied['form'] : {};
  const dataForm = isRecord(data['form']) ? data['form'] : isRecord(data['lead_context']) ? data['lead_context'] : {};
  const suppliedConsent = isRecord(supplied['consent']) ? supplied['consent'] : {};
  const dataConsent = isRecord(data['consent']) ? data['consent'] : {};
  const consent = context.consent ?? dataConsent;

  return {
    schema_version: 1,
    event_id: eventId,
    trail_id: prefixed(firstText(supplied['trail_id'], data['trail_id'], payload['trail_id'], visitorId), 'trl_'),
    anonymous_id: anonymousId,
    lead_id: leadId,
    workspace_id: firstText(context.workspaceId, supplied['workspace_id'], data['workspace_id']),
    site_id: firstText(context.siteId, supplied['site_id'], data['site_id']),
    event_name: firstText(supplied['event_name'], canonicalEventName(eventName)),
    occurred_at: firstText(supplied['occurred_at'], data['occurred_at'], data['event_time']),
    landing_page: firstText(supplied['landing_page'], touchValue(payload, 'landing_page', data)),
    referrer: firstText(supplied['referrer'], touchValue(payload, 'referrer', data)),
    source: firstText(supplied['source'], touchValue(payload, 'source', data)),
    medium: firstText(supplied['medium'], touchValue(payload, 'medium', data)),
    campaign: firstText(supplied['campaign'], touchValue(payload, 'campaign', data)),
    click_ids: clickIds,
    consent: {
      analytics: Boolean(suppliedConsent['analytics'] ?? consent['analytics']),
      advertising: Boolean(suppliedConsent['advertising'] ?? suppliedConsent['marketing'] ?? consent['advertising'] ?? consent['marketing']),
    },
    form: {
      provider: firstText(suppliedForm['provider'], dataForm['provider'], data['form_provider']),
      form_id: firstText(suppliedForm['form_id'], dataForm['form_id'], data['form_id']),
    },
  };
}

/**
 * Build an outbound event from the canonical payload + event name + optional
 * caller data. Never mutates the inputs. Caller data is merged AFTER the
 * canonical payload so hosts may attach extra context (and override
 * `event_time` with their own injected-clock value).
 */
export function buildEventPayload(
  payload: AttributionPayload,
  eventName: string,
  data?: Record<string, unknown>,
  context?: MarketingTrailContext,
): ClickTrailEvent {
  const base: Record<string, unknown> = { ...payload };
  if (data) Object.assign(base, data);
  base.event_name = eventName;
  base.marketing_trail = buildMarketingTrailEnvelope(payload, eventName, base, context);
  return stampVersions(base) as ClickTrailEvent;
}
