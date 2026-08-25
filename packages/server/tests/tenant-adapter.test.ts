import { describe, expect, it, vi } from 'vitest';
import {
  createTenantAdapter,
  validateTenantAdapterConfig,
} from '../src/tenant-adapter.js';

function baseConfig() {
  return {
    endpoint: 'https://collector.example.com/v1/events',
    tenantId: 'med10x-tenant-1',
    siteId: 'site-1',
    workspaceId: 'workspace-1',
    adapterName: 'med10x',
    adapterVersion: '0.1.0',
  };
}

function input(externalEventId = 'provider-event-1') {
  return {
    identity: {
      payload: { ft_source: 'google' },
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      sessionNumber: 2,
    },
    eventName: 'lead',
    externalEventId,
    data: { properties: { source_status: 'new' } },
    now: '2026-08-25T10:00:00.000Z',
  };
}

describe('tenant adapter validation', () => {
  it('requires trusted tenant metadata and a safe endpoint', () => {
    expect(() => validateTenantAdapterConfig({ ...baseConfig(), tenantId: '' })).toThrow(/tenantId/);
    expect(() => validateTenantAdapterConfig({ ...baseConfig(), endpoint: 'https://user:pass@collector.example.com' })).toThrow(/public absolute https/);
    expect(() => validateTenantAdapterConfig({ ...baseConfig(), endpoint: 'javascript:alert(1)' })).toThrow(/public absolute https/);
  });
});

describe('TenantAdapter', () => {
  it('canonicalizes events and keeps tenant metadata in properties', () => {
    const adapter = createTenantAdapter(baseConfig());
    const event = adapter.build(input());

    expect(event.event_name).toBe('lead_created');
    expect(event.event_id).toMatch(/^evt_s-/);
    expect(event.occurred_at).toBe('2026-08-25T10:00:00.000Z');
    expect(event.properties).toEqual({
      source_status: 'new',
      tenant_id: 'med10x-tenant-1',
      adapter_name: 'med10x',
      adapter_version: '0.1.0',
    });
    expect(event.ft_source).toBe('google');
    expect(event.visitor_id).toBe('visitor-1');
    expect(event.session_id).toBe('session-1');
    expect(event.session_number).toBe('2');
    expect(event.marketing_trail.event_id).toBe(event.event_id);
    expect(event.marketing_trail.source).toBe('google');
    expect(event.marketing_trail.anonymous_id).toBe('anon_visitor-1');
  });

  it('reuses one event id for the same tenant event across retries', () => {
    const adapter = createTenantAdapter(baseConfig());
    expect(adapter.build(input()).event_id).toBe(adapter.build(input()).event_id);
    expect(adapter.build(input('provider-event-2')).event_id).not.toBe(adapter.build(input()).event_id);
  });

  it('does not let input data replace canonical identity or tenant metadata', () => {
    const adapter = createTenantAdapter(baseConfig());
    const event = adapter.build({
      ...input(),
      data: {
        event_id: 'evt_attacker',
        event_name: 'sale',
        marketing_trail: { event_id: 'evt_attacker' },
        visitor_id: 'attacker-visitor',
        session_id: 'attacker-session',
        session_number: '999',
        properties: { tenant_id: 'other-tenant' },
      },
    });

    expect(event.event_name).toBe('lead_created');
    expect(event.event_id).not.toBe('evt_attacker');
    expect(event.visitor_id).toBe('visitor-1');
    expect(event.session_id).toBe('session-1');
    expect(event.session_number).toBe('2');
    expect(event.marketing_trail.event_id).toBe(event.event_id);
    expect(event.properties).toMatchObject({ tenant_id: 'med10x-tenant-1' });
  });

  it('keeps distinct tenant events distinct across a known 32-bit collision pair', () => {
    const first = createTenantAdapter({ ...baseConfig(), tenantId: 'tenant-a' });
    const second = createTenantAdapter({ ...baseConfig(), tenantId: 'tenant-b' });

    expect(first.build(input('provider-bzj5xdm3z8n6')).event_id).not.toBe(
      second.build(input('provider-6t1hedgr8o2r')).event_id,
    );
  });

  it('sends one stable event through the existing server client', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const adapter = createTenantAdapter({ ...baseConfig(), fetch: fetchImpl as unknown as typeof fetch });
    await expect(adapter.send(input())).resolves.toEqual({ ok: true, status: 204 });
    await expect(adapter.send(input())).resolves.toEqual({ ok: true, status: 204 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      events: Array<Record<string, unknown>>;
    };
    const second = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as {
      events: Array<Record<string, unknown>>;
    };
    expect(first.events[0]?.['event_id']).toBe(second.events[0]?.['event_id']);
  });

  it('rejects an empty external event id before sending', () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const adapter = createTenantAdapter({ ...baseConfig(), fetch: fetchImpl as unknown as typeof fetch });
    expect(() => adapter.build(input(''))).toThrow(/externalEventId/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
