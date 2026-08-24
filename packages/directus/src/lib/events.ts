/**
 * Pure event builders for the Directus extension.
 *
 * Everything here is deterministic: no fetch, no clock, no env access.
 * The operation/hook handlers inject those. Events are built through the
 * SDK common layer ({@link buildEventPayload}) so every outbound event is
 * schema/classifier stamped with the marketing_trail envelope.
 */
import { buildEventPayload } from '@vizuh/clicktrail/browser';
import type {
  AttributionPayload,
} from '@vizuh/clicktrail';
import type { ClickTrailEvent, MarketingTrailContext } from '@vizuh/clicktrail/browser';

/**
 * Event-name contract shared by every sibling integration (astro, nuxt,
 * n8n, piece, typebot). Mirrored exactly; do not rename locally.
 */
export const EVENT_NAMES = [
  'lead',
  'lead.attribution_attached',
  'lead.stage_updated',
  'lead.qualified',
  'lead.merged',
  'booking',
  'appointment.completed',
  'sale.recorded',
  'revenue.recurring',
  'refund.issued',
  'offline_conversion.sent',
  'consent.granted',
  'consent.withdrawn',
  'consent.policy_updated',
] as const;

export type ContractEventName = (typeof EVENT_NAMES)[number];

export interface BuildEventArgs {
  eventName: string;
  /** Canonical flat attribution payload (ft_/lt_/click ids/visitor ids). */
  payload?: AttributionPayload;
  /** Extra caller data merged after the payload (event_time overrides it). */
  data?: Record<string, unknown>;
  siteId?: string | undefined;
  workspaceId?: string | undefined;
  consent?: MarketingTrailContext['consent'] | undefined;
}

/** Validation style mirrors @clicktrail/astro/server: TypeError on bad input. */
function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`directus-extension-clicktrail: ${field} must be a non-empty string.`);
  }
  return value;
}

/**
 * Parse a JSON object string tolerantly. Returns null for empty input or
 * anything that does not parse to a plain object — never throws.
 */
export function safeParseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build one collector-ready event from operation/hook inputs. */
export function buildOperationEvent(args: BuildEventArgs): ClickTrailEvent {
  const eventName = requireNonEmptyString(args.eventName, 'eventName');
  const context: MarketingTrailContext = {};
  if (args.siteId !== undefined) context.siteId = args.siteId;
  if (args.workspaceId !== undefined) context.workspaceId = args.workspaceId;
  if (args.consent !== undefined) context.consent = args.consent;

  return buildEventPayload(args.payload ?? {}, eventName, args.data ?? {}, context);
}

/** Consent flags from loose Flow config values (booleans or truthy strings). */
export function parseConsent(
  analytics: unknown,
  advertising: unknown,
): { analytics: boolean; advertising: boolean } {
  const truthy = (value: unknown): boolean =>
    value === true || value === 'true' || value === 1 || value === '1';
  return { analytics: truthy(analytics), advertising: truthy(advertising) };
}
