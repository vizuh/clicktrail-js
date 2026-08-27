/**
 * P1 — API hook: attach attribution on collection creates.
 *
 * Listens to items.create across CONFIGURABLE collections (default:
 * leads/bookings/orders), extracts attribution signals from the item
 * payload via lib/mapping.ts, builds the mapped contract event through the
 * SDK common layer, and forwards it to the collector. When
 * CLICKTRAIL_STORE_LOCALLY=true each forwarded event is ALSO written to the
 * `clicktrail_events` Directus collection so the dashboard panel can read
 * locally without any external dependency.
 *
 * Like the operation, the hook never throws into the host: failures are
 * logged and swallowed so an analytics outage cannot break writes.
 */
import { buildOperationEvent } from '../lib/events.js';
import { isSafeHttpUrl } from '@vizuh/clicktrail-core';
import {
  DEFAULT_COLLECTIONS,
  buildCanonicalPayload,
  eventForCollection,
} from '../lib/mapping.js';
import type { ApiExtensionContext, HookMeta, ItemsService } from '../types.js';

export const LOCAL_EVENT_COLLECTION = 'clicktrail_events';

export interface HookConfig {
  collections?: readonly string[];
}

export interface HookDeps {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  log?: { warn(message: unknown): void; info?(message: unknown): void };
  createItemsService?(): ItemsService | undefined;
}

export function configuredCollections(config: HookConfig): string[] {
  if (Array.isArray(config.collections)) {
    const filtered = config.collections.filter((c): c is string => typeof c === 'string' && c.trim() !== '');
    if (filtered.length > 0) return filtered;
  }
  return [...DEFAULT_COLLECTIONS];
}

/** Pure resolution of collection -> event name (null = not tracked). */
export function resolveHookTarget(collection: unknown): { collection: string; eventName: string } | null {
  if (typeof collection !== 'string') return null;
  const eventName = eventForCollection(collection);
  return eventName === null ? null : { collection, eventName };
}

interface CollectorOptions {
  siteId?: string;
  endpoint: string;
  apiKey: string;
}

function collectorOptions(env: Record<string, string | undefined>): CollectorOptions | null {
  const endpoint = (env['CLICKTRAIL_ENDPOINT'] ?? '').trim();
  if (endpoint === '' || !isSafeHttpUrl(endpoint)) return null;
  return {
    endpoint,
    ...(env['CLICKTRAIL_SITE_ID'] ? { siteId: (env['CLICKTRAIL_SITE_ID'] ?? '').trim() } : {}),
    apiKey: (env['CLICKTRAIL_API_KEY'] ?? '').trim(),
  };
}

/** Flatten a built event into a storable row for clicktrail_events. */
export function eventToStoredRow(event: Record<string, unknown>): Record<string, unknown> {
  const trail = event['marketing_trail'];
  const campaign =
    trail !== null && typeof trail === 'object' && !Array.isArray(trail)
      ? (trail as Record<string, unknown>)['campaign']
      : '';
  return {
    event_name: event['event_name'],
    campaign: typeof campaign === 'string' ? campaign : '',
    lead_id: typeof event['lead_id'] === 'string' ? event['lead_id'] : '',
    occurred_at:
      typeof event['occurred_at'] === 'string'
        ? event['occurred_at']
        : new Date().toISOString(),
    payload_json: JSON.stringify(event),
  };
}

/**
 * Create the hook factory. The returned function receives the Directus
 * registration context ({ filter }) and wires items.create.
 */
export function createClickTrailHook(deps: HookDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return function register(context: Pick<ApiExtensionContext, 'services'> & { filter?: (event: string, handler: (payload: Record<string, unknown>, meta: HookMeta) => unknown) => void }): void {
    if (typeof context?.filter !== 'function') return;

    context.filter('items.create', async (payload, meta) => {
      try {
        const target = resolveHookTarget(meta?.collection);
        if (target === null) return payload;
        if (payload === null || typeof payload !== 'object') return payload;

        const options = collectorOptions(deps.env ?? {});
        if (options === null) return payload;

        const canonicalPayload = buildCanonicalPayload(payload);
        const event = buildOperationEvent({
          eventName: target.eventName,
          payload: canonicalPayload,
          data: {
            form_provider: 'directus',
            form_id: target.collection,
            lead_id: typeof payload['id'] === 'string' || typeof payload['id'] === 'number'
              ? String(payload['id'])
              : undefined,
          },
          ...(options.siteId !== undefined && options.siteId !== '' ? { siteId: options.siteId } : {}),
        });

        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (options.apiKey !== '') headers['x-clicktrail-key'] = options.apiKey;

        await fetchImpl(options.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ events: [event] }),
          redirect: 'error',
        }).catch(() => undefined);

        if ((deps.env?.['CLICKTRAIL_STORE_LOCALLY'] ?? '').trim().toLowerCase() === 'true') {
          try {
            const service = deps.createItemsService?.();
            await service?.createOne(eventToStoredRow(event));
          } catch (storeError) {
            deps.log?.warn(`clicktrail hook: local store failed: ${String(storeError)}`);
          }
        }

        return payload;
      } catch (error) {
        try {
          deps.log?.warn(`clicktrail hook: skipped attribution: ${String(error)}`);
        } catch {
          // Best effort logging.
        }
        return payload;
      }
    });
  };
}

/** Default factory wired to real fetch/env/ItemsService. */
export const hook = function (context: Parameters<ReturnType<typeof createClickTrailHook>>[0]): void {
  const deps: HookDeps = {
    env: typeof process !== 'undefined' ? process.env : {},
    createItemsService: () => {
      const ItemsServiceCtor = context.services?.ItemsService;
      if (typeof ItemsServiceCtor !== 'function') return undefined;
      return new ItemsServiceCtor({
        collection: LOCAL_EVENT_COLLECTION,
        schema: undefined,
      });
    },
  };
  return createClickTrailHook(deps)(context);
};

export default hook;
