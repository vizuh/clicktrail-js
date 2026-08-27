/**
 * ClickTrail API credentials for the n8n community node.
 *
 * Structural imports from `n8n-workflow` are allowed here and in the node:
 * this package IS an n8n plugin. The pure helpers below stay testable
 * outside the n8n runtime.
 */
import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/** Default request timeout in milliseconds (request-level, 10s). */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Header name carrying the optional collector API key. */
export const API_KEY_HEADER = 'X-ClickTrail-Key';

/**
 * Enforce an https collector endpoint. Pure: throws TypeError on anything
 * that is not a valid https:// URL.
 */
export function validateCollectorUrl(rawUrl: unknown): URL {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new TypeError('clicktrail: baseUrl must be a non-empty https:// URL.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError(`clicktrail: baseUrl is not a valid URL: ${String(rawUrl)}`);
  }
  if (url.protocol !== 'https:') {
    throw new TypeError(`clicktrail: baseUrl must use https (got ${url.protocol}).`);
  }
  return url;
}

/**
 * Wire the optional API key into request headers. No header is emitted when
 * no key is configured.
 */
export function buildRequestHeaders(apiKey?: unknown): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (typeof apiKey === 'string' && apiKey.trim() !== '') {
    headers[API_KEY_HEADER] = apiKey;
  }
  return headers;
}

export class ClickTrailApi implements ICredentialType {
  name = 'clickTrailApi';

  displayName = 'ClickTrail API';

  documentationUrl =
    'https://github.com/vizuh/clicktrail-js/tree/master/integrations/n8n#readme';

  properties: INodeProperties[] = [
    {
      displayName: 'Collector Endpoint',
      name: 'baseUrl',
      type: 'string',
      required: true,
      default: '',
      placeholder: 'https://collector.example.com/v1/events',
      description: 'ClickTrail collector endpoint receiving { events: [...] } batches. Must be https.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      // Modern n8n-workflow expresses password fields as string + password typeOption.
      type: 'string',
      required: false,
      default: '',
      typeOptions: { password: true },
      description: 'Optional shared secret sent as the X-ClickTrail-Key header when set.',
    },
    {
      displayName: 'Request Timeout',
      name: 'timeout',
      type: 'number',
      required: true,
      default: DEFAULT_TIMEOUT_MS,
      description: 'Request-level timeout in milliseconds.',
    },
  ];
}
