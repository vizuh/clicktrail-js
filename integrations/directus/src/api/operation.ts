/**
 * P0 — Flow operation "Send event to ClickTrail".
 *
 * Server-side piece: builds one ClickTrail event from Flow config and POSTs
 * `{ events: [event] }` to the collector. NEVER throws into the Flow engine:
 * every failure mode (bad config, bad JSON, network error, non-2xx) becomes
 * a logged, returned result so one analytics outage can never kill a
 * customer automation.
 */
import { buildOperationEvent, parseConsent, safeParseJsonObject } from '../lib/events.js';
import type { AttributionPayload } from '@vizuh/clicktrail';
import { isSafeHttpUrl } from '@vizuh/clicktrail-core';
import type { ApiExtensionContext, Logger, OperationConfig } from '../types.js';

export const OPERATION_ID = 'clicktrail-send-event';

/** Result shape surfaced to the Flow engine and tests. */
export interface OperationResult {
  ok: boolean;
  status: number;
  /** Human-readable failure reason; present only when ok === false. */
  error?: string | undefined;
}

export interface OperationDeps {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  log?: Partial<Logger> | undefined;
}

type EndpointResolution =
  | { value: string; fromConfig: boolean }
  | { error: 'missing' | 'invalid' };

function resolveEndpoint(deps: OperationDeps, config: OperationConfig): EndpointResolution {
  const configEndpoint =
    typeof config['endpoint'] === 'string' && config['endpoint'].trim() !== ''
      ? config['endpoint'].trim()
      : '';
  const envEndpoint =
    typeof deps.env?.['CLICKTRAIL_ENDPOINT'] === 'string'
      ? (deps.env['CLICKTRAIL_ENDPOINT'] ?? '').trim()
      : '';
  const value = configEndpoint || envEndpoint;
  if (value === '') return { error: 'missing' };

  if (!isSafeHttpUrl(value)) return { error: 'invalid' };
  return { value, fromConfig: configEndpoint !== '' };
}

function resolveApiKey(deps: OperationDeps, config: OperationConfig, endpointFromConfig: boolean): string {
  if (typeof config['apiKey'] === 'string' && config['apiKey'].trim() !== '') {
    return config['apiKey'].trim();
  }
  if (endpointFromConfig) return '';
  return typeof deps.env?.['CLICKTRAIL_API_KEY'] === 'string'
    ? (deps.env['CLICKTRAIL_API_KEY'] ?? '').trim()
    : '';
}

/**
 * Create the Flow-operation handler with injectable fetch/env/logger so
 * tests exercise the exact production code path (fake-fetch matrix).
 */
export function createSendEventHandler(
  deps: OperationDeps = {},
): (config: OperationConfig, context?: Partial<ApiExtensionContext>) => Promise<OperationResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async (config, _context) => {
    try {
      const eventName = config['eventName'];
      if (typeof eventName !== 'string' || eventName.trim() === '') {
        return { ok: false, status: 400, error: 'eventName is required.' };
      }
      const payload = safeParseJsonObject(config['payload']);
      if (
        config['payload'] !== undefined &&
        config['payload'] !== null &&
        config['payload'] !== '' &&
        payload === null
      ) {
        return { ok: false, status: 400, error: 'payload must be a JSON object string when provided.' };
      }

      const endpoint = resolveEndpoint(deps, config);
      if ('error' in endpoint) {
        return {
          ok: false,
          status: 400,
          error:
            endpoint.error === 'missing'
              ? 'No collector endpoint configured. Set CLICKTRAIL_ENDPOINT or pass endpoint.'
              : 'Collector endpoint must be a public absolute https URL without embedded credentials.',
        };
      }

      const consent = parseConsent(config['consentAnalytics'], config['consentAdvertising']);
      const event = buildOperationEvent({
        eventName,
        ...(payload !== null ? { payload: payload as AttributionPayload } : {}),
        ...(typeof config['siteId'] === 'string' && config['siteId'] !== ''
          ? { siteId: config['siteId'] }
          : {}),
        ...(typeof config['workspaceId'] === 'string' && config['workspaceId'] !== ''
          ? { workspaceId: config['workspaceId'] }
          : {}),
        consent,
      });

      const apiKey = resolveApiKey(deps, config, endpoint.fromConfig);
      const response = await fetchImpl(endpoint.value, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey !== '' ? { 'x-clicktrail-key': apiKey } : {}),
        },
        body: JSON.stringify({ events: [event] }),
      });
      return { ok: response.ok, status: response.status };
    } catch (error) {
      try {
        deps.log?.warn?.(`clicktrail operation: send failed: ${String(error)}`);
      } catch {
        // Logging is best effort; never throw into the Flow engine.
      }
      return { ok: false, status: 0, error: String(error) };
    }
  };
}

/** Default handler wired to real fetch + process.env. */
export const sendEventHandler = createSendEventHandler({
  env: typeof process !== 'undefined' ? process.env : {},
});

export interface OperationManifest {
  id: string;
  name: string;
  icon: string;
  overview: string;
  handler: typeof sendEventHandler;
}

export const operation: OperationManifest = {
  id: OPERATION_ID,
  name: 'Send event to ClickTrail',
  icon: 'send',
  overview:
    'Builds a schema-stamped ClickTrail attribution event and posts it to your collector. Never fails the Flow on analytics outages.',
  handler: sendEventHandler,
};

export default operation;
