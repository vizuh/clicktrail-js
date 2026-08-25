import { deriveStableEventId, sanitizeField } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';

export const DEFAULT_FORMBRICKS_FIELDS = [
  'ft_source',
  'ft_medium',
  'ft_campaign',
  'ft_term',
  'ft_content',
  'ft_channel',
  'lt_source',
  'lt_medium',
  'lt_campaign',
  'lt_term',
  'lt_content',
  'lt_channel',
] as const;

export type FormbricksField = (typeof DEFAULT_FORMBRICKS_FIELDS)[number];

export interface FormbricksFieldOptions {
  prefix?: string;
  fields?: readonly string[];
}

export interface FormbricksWebhookPayload {
  webhookId?: string;
  event: FormbricksResponseEvent;
  data: FormbricksResponseRecord;
}

export const FORMBRICKS_RESPONSE_EVENTS = [
  'responseCreated',
  'responseUpdated',
  'responseFinished',
] as const;

export type FormbricksResponseEvent = (typeof FORMBRICKS_RESPONSE_EVENTS)[number];

export interface FormbricksResponseRecord {
  id: string;
  surveyId: string;
  createdAt?: string;
  finished?: boolean;
  contactId?: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface FormbricksLeadMapping {
  identity: {
    payload: AttributionPayload;
  };
  data: Record<string, unknown>;
}

export interface FormbricksLeadMappingOptions extends FormbricksFieldOptions {
  siteId: string;
  workspaceId?: string;
  occurredAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const result = sanitizeField(String(value));
  return result === '' ? undefined : result;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`formbricks.${field} must be a non-empty string`);
  const result = text(value);
  if (!result) throw new TypeError(`formbricks.${field} must be a non-empty string`);
  return result;
}

function resolveOptions(options: FormbricksFieldOptions = {}): {
  prefix: string;
  fields: readonly string[];
} {
  const prefix = options.prefix ?? 'ct_';
  if (!/^[a-z][a-z0-9_]*_$/.test(prefix)) {
    throw new TypeError('formbricks.prefix must contain lowercase letters, digits, underscores, and end with _');
  }

  const fields = options.fields ?? DEFAULT_FORMBRICKS_FIELDS;
  if (fields.length === 0) throw new TypeError('formbricks.fields must not be empty');
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]*$/.test(field)) {
      throw new TypeError(`formbricks.fields contains invalid field "${field}"`);
    }
  }
  return { prefix, fields };
}

export function decorateFormbricksSurveyUrl(
  input: string | URL,
  attribution: Record<string, unknown>,
  options: FormbricksFieldOptions = {},
): string {
  const source = typeof input === 'string' ? input : input.toString();
  if (source.trim() === '') throw new TypeError('formbricks survey URL must not be empty');

  const { prefix, fields } = resolveOptions(options);
  const normalizedSource = source.trim();
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(normalizedSource);
  let url: URL;
  try {
    url = absolute
      ? new URL(normalizedSource)
      : new URL(normalizedSource, 'https://clicktrail.invalid');
  } catch {
    throw new TypeError('formbricks survey URL must be a valid URL');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    (!absolute && url.origin !== 'https://clicktrail.invalid')
  ) {
    throw new TypeError('formbricks survey URL must use http(s) or a same-origin relative URL');
  }

  for (const field of fields) {
    const value = text(attribution[field]);
    if (value !== undefined) url.searchParams.set(`${prefix}${field}`, value);
  }

  if (absolute) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseFormbricksWebhook(input: unknown): FormbricksWebhookPayload {
  if (!isRecord(input)) throw new TypeError('formbricks webhook must be an object');

  const event = input['event'];
  if (!FORMBRICKS_RESPONSE_EVENTS.includes(event as FormbricksResponseEvent)) {
    throw new TypeError(`formbricks.event is unsupported: ${String(event)}`);
  }

  const rawResponse = input['data'];
  if (!isRecord(rawResponse)) throw new TypeError('formbricks.data must be an object');

  const response: FormbricksResponseRecord = {
    id: requiredText(rawResponse['id'], 'data.id'),
    surveyId: requiredText(rawResponse['surveyId'], 'data.surveyId'),
    data: isRecord(rawResponse['data']) ? rawResponse['data'] : {},
  };
  const createdAt = text(rawResponse['createdAt']);
  const contactId = text(rawResponse['contactId']);
  const meta = isRecord(rawResponse['meta']) ? rawResponse['meta'] : undefined;
  if (createdAt !== undefined) response.createdAt = createdAt;
  if (contactId !== undefined) response.contactId = contactId;
  if (typeof rawResponse['finished'] === 'boolean') response.finished = rawResponse['finished'];
  if (meta !== undefined) response.meta = meta;

  const result: FormbricksWebhookPayload = {
    event: event as FormbricksResponseEvent,
    data: response,
  };
  const webhookId = text(input['webhookId']);
  if (webhookId !== undefined) result.webhookId = webhookId;
  return result;
}

export function toClickTrailLead(
  webhook: FormbricksWebhookPayload,
  options: FormbricksLeadMappingOptions,
): FormbricksLeadMapping | null {
  if (webhook.event !== 'responseFinished') return null;

  const siteId = requiredText(options.siteId, 'siteId');
  const occurredAt = webhook.data.createdAt ?? text(options.occurredAt);
  if (!occurredAt) throw new TypeError('formbricks response needs createdAt or options.occurredAt');

  const { prefix, fields } = resolveOptions(options);
  const payload: AttributionPayload = {};
  for (const field of fields) {
    const value = text(webhook.data.data[`${prefix}${field}`]);
    if (value !== undefined) payload[field] = value;
  }

  const data: Record<string, unknown> = {
    event_id: deriveStableEventId(siteId, `formbricks:${webhook.data.id}:${webhook.event}`),
    event_time: occurredAt,
    form_id: webhook.data.surveyId,
    lead_id: webhook.data.id,
    site_id: siteId,
    properties: {
      formbricks_event: webhook.event,
      formbricks_response_id: webhook.data.id,
      formbricks_survey_id: webhook.data.surveyId,
      ...(webhook.webhookId ? { formbricks_webhook_id: webhook.webhookId } : {}),
    },
  };
  const workspaceId = text(options.workspaceId);
  if (workspaceId !== undefined) data['workspace_id'] = workspaceId;
  if (webhook.data.contactId !== undefined) data['contact_id'] = webhook.data.contactId;

  return {
    identity: { payload },
    data,
  };
}
