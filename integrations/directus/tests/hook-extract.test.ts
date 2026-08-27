import { describe, expect, it, vi } from 'vitest';
import {
  configuredCollections,
  resolveHookTarget,
  eventToStoredRow,
  createClickTrailHook,
} from '../src/api/hook.js';
import { buildOperationEvent } from '../src/lib/events.js';

describe('resolveHookTarget', () => {
  it('maps tracked collections and rejects others', () => {
    expect(resolveHookTarget('leads')).toEqual({ collection: 'leads', eventName: 'lead_created' });
    expect(resolveHookTarget('bookings')).toEqual({ collection: 'bookings', eventName: 'booking_created' });
    expect(resolveHookTarget('orders')).toEqual({ collection: 'orders', eventName: 'sale' });
    expect(resolveHookTarget('media')).toBeNull();
    expect(resolveHookTarget(undefined)).toBeNull();
    expect(resolveHookTarget(42)).toBeNull();
  });
});

describe('configuredCollections', () => {
  it('uses the option when valid, defaults otherwise', () => {
    expect(configuredCollections({ collections: ['deals'] })).toEqual(['deals']);
    expect(configuredCollections({ collections: [] })).toEqual(['leads', 'bookings', 'orders']);
    expect(configuredCollections({ collections: ['', 5] as unknown as string[] })).toEqual(['leads', 'bookings', 'orders']);
    expect(configuredCollections({})).toEqual(['leads', 'bookings', 'orders']);
  });
});

describe('eventToStoredRow (panel data contract)', () => {
  it('flattens event_name, campaign, lead_id, occurred_at + payload_json round-trip', () => {
    const event = buildOperationEvent({
      eventName: 'lead_created',
      payload: { lt_campaign: 'spring' },
      siteId: 's1',
      data: { lead_id: 'lead_1' },
    });
    const row = eventToStoredRow(event);
    expect(row['event_name']).toBe('lead_created');
    expect(row['campaign']).toBe('spring');
    expect(row['lead_id']).toBe('lead_1');
    expect(typeof row['occurred_at']).toBe('string');
    const parsed = JSON.parse(String(row['payload_json'])) as Record<string, unknown>;
    expect(parsed['marketing_trail']).toBeTruthy();
    expect(parsed['event_name']).toBe('lead_created');
  });

  it('defaults campaign to empty string when envelope has none', () => {
    const event = buildOperationEvent({ eventName: 'booking_created', payload: {} });
    const row = eventToStoredRow(event);
    expect(row['campaign']).toBe('');
  });
});

describe('createClickTrailHook registration + forwarding', () => {
  function makeContext() {
    const handlers: Record<string, ReturnType<typeof vi.fn>> = {};
    return {
      context: {
        filter: (event: string, handler: unknown) => {
          handlers[event] = handler as ReturnType<typeof vi.fn>;
        },
        services: {},
      },
      handlers,
    };
  }

  it('registers items.create exactly once', () => {
    const { context, handlers } = makeContext();
    createClickTrailHook({
      fetchImpl: async () => new Response('{}'),
      env: { CLICKTRAIL_ENDPOINT: 'https://collector.test/collect' },
    })(context);
    expect(Object.keys(handlers)).toEqual(['items.create']);
  });

  it('forwards a mapped event for a tracked collection with attribution extracted', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    const { context, handlers } = makeContext();
    createClickTrailHook({ fetchImpl, env: { CLICKTRAIL_ENDPOINT: 'https://c.test/x', CLICKTRAIL_SITE_ID: 's1' } })(context);

    const item = { id: 12, utm_source: 'newsletter', visitor_id: 'v1' };
    const returned = await handlers['items.create']!(item, { collection: 'leads' });

    expect(returned).toBe(item); // payload never mutated
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://c.test/x');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]?.['event_name']).toBe('lead_created');
    expect(body.events[0]?.['lt_source']).toBe('newsletter');
    expect(body.events[0]?.['visitor_id']).toBe('v1');
    expect(body.events[0]?.['form_provider']).toBe('directus');
    const trail = body.events[0]?.['marketing_trail'] as Record<string, unknown>;
    expect(trail['site_id']).toBe('s1');
  });

  it('ignores untracked collections without touching fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    const { context, handlers } = makeContext();
    createClickTrailHook({ fetchImpl, env: { CLICKTRAIL_ENDPOINT: 'https://c.test/x' } })(context);
    await handlers['items.create']!({ title: 'x' }, { collection: 'articles' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips everything when no endpoint env is configured', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    const { context, handlers } = makeContext();
    createClickTrailHook({ fetchImpl, env: {} })(context);
    await handlers['items.create']!({ utm_source: 'x' }, { collection: 'leads' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('NEVER throws: collector failure is swallowed and payload still returns', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    });
    const { context, handlers } = makeContext();
    createClickTrailHook({
      fetchImpl,
      env: { CLICKTRAIL_ENDPOINT: 'https://c.test/x' },
      log: { warn: () => {} },
    })(context);
    const item = { gclid: 'G1' };
    await expect(handlers['items.create']!(item, { collection: 'leads' })).resolves.toBe(item);
  });

  it('stores locally when CLICKTRAIL_STORE_LOCALLY=true (panel write path)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down'); // local store must happen even if egress fails
    });
    const created: Array<Record<string, unknown>> = [];
    const { context, handlers } = makeContext();
    createClickTrailHook({
      fetchImpl,
      env: {
        CLICKTRAIL_ENDPOINT: 'https://c.test/x',
        CLICKTRAIL_STORE_LOCALLY: 'true',
      },
      log: { warn: () => {} },
      createItemsService: () => ({
        createOne: async (data: Record<string, unknown>) => {
          created.push(data);
          return 1;
        },
      }),
    })(context);
    await handlers['items.create']!({ utm_source: 'ads', utm_campaign: 'q3' }, { collection: 'orders' });
    expect(created).toHaveLength(1);
    expect(created[0]?.['event_name']).toBe('sale');
    expect(created[0]?.['campaign']).toBe('q3'); // from utm-derived last touch
  });

  it('does not store locally unless the flag is set', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    let storedCount = 0;
    const { context, handlers } = makeContext();
    createClickTrailHook({
      fetchImpl,
      env: { CLICKTRAIL_ENDPOINT: 'https://c.test/x' },
      createItemsService: () => ({
        createOne: async () => {
          storedCount += 1;
          return 1;
        },
      }),
    })(context);
    await handlers['items.create']!({ utm_source: 'x' }, { collection: 'leads' });
    expect(storedCount).toBe(0);
  });
});
