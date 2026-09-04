import { buildEventPayload, sanitizeServerEventInput } from '@vizuh/clicktrail-browser';
import type { ClickTrailEvent } from '@vizuh/clicktrail-browser';
import {
  deriveStableEventId,
  isSafeHttpUrl,
  toCanonicalEventName,
} from '@vizuh/clicktrail-core';
import {
  ClickTrailServer,
  type ClickTrailServerConfig,
  type SendResult,
  type ServerIdentity,
} from './server.js';

export interface TenantAdapterConfig extends Omit<ClickTrailServerConfig, 'siteId'> {
  tenantId: string;
  siteId: string;
  adapterName: string;
  adapterVersion: string;
}

export interface TenantAdapterEventInput {
  identity: ServerIdentity;
  eventName: string;
  externalEventId: string;
  data?: Record<string, unknown>;
  now?: string;
}

function requireTenantText(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError(`clicktrail tenant adapter: ${field} must be a valid non-empty string.`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateTenantAdapterConfig(config: TenantAdapterConfig): TenantAdapterConfig {
  const endpoint = requireTenantText(config.endpoint, 'endpoint');
  if (!isSafeHttpUrl(endpoint)) {
    throw new TypeError('clicktrail tenant adapter: endpoint must be a public absolute https URL.');
  }
  return {
    ...config,
    endpoint,
    tenantId: requireTenantText(config.tenantId, 'tenantId'),
    siteId: requireTenantText(config.siteId, 'siteId'),
    adapterName: requireTenantText(config.adapterName, 'adapterName'),
    adapterVersion: requireTenantText(config.adapterVersion, 'adapterVersion'),
  };
}

export class TenantAdapter {
  private readonly config: TenantAdapterConfig;
  private readonly server: ClickTrailServer;

  constructor(config: TenantAdapterConfig) {
    this.config = validateTenantAdapterConfig(config);
    this.server = new ClickTrailServer(this.config);
  }

  build(input: TenantAdapterEventInput): ClickTrailEvent {
    const eventName = toCanonicalEventName(requireTenantText(input.eventName, 'eventName'));
    const externalEventId = requireTenantText(input.externalEventId, 'externalEventId');
    const eventId = deriveStableEventId(
      this.config.siteId,
      JSON.stringify([this.config.tenantId, this.config.adapterName, eventName, externalEventId]),
    );
    const inputProperties = isRecord(input.data?.['properties']) ? input.data['properties'] : {};
    const data = sanitizeServerEventInput({ ...(input.data ?? {}) });

    return buildEventPayload(sanitizeServerEventInput(input.identity.payload ?? {}), eventName, {
      ...data,
      site_id: this.config.siteId,
      ...(this.config.workspaceId !== undefined ? { workspace_id: this.config.workspaceId } : {}),
      event_id: eventId,
      ...(input.now !== undefined
        ? { event_time: requireTenantText(input.now, 'now'), occurred_at: input.now }
        : {}),
      ...(input.identity.visitorId ? { visitor_id: input.identity.visitorId } : {}),
      ...(input.identity.sessionId ? { session_id: input.identity.sessionId } : {}),
      ...(input.identity.sessionNumber !== undefined
        ? { session_number: String(input.identity.sessionNumber) }
        : {}),
      properties: {
        ...inputProperties,
        tenant_id: this.config.tenantId,
        adapter_name: this.config.adapterName,
        adapter_version: this.config.adapterVersion,
      },
    }, {
      siteId: this.config.siteId,
      ...(this.config.workspaceId !== undefined ? { workspaceId: this.config.workspaceId } : {}),
      ...(input.identity.visitorId
        ? { identity: { visitorId: input.identity.visitorId } }
        : {}),
    });
  }

  send(input: TenantAdapterEventInput): Promise<SendResult> {
    return this.server.send([this.build(input)]);
  }
}

export function createTenantAdapter(config: TenantAdapterConfig): TenantAdapter {
  return new TenantAdapter(config);
}
