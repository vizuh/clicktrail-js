/**
 * Shared configuration contract + compile-time injection keys.
 *
 * User options are serialized into Vite `define` globals at build time
 * (`astro:config:setup` -> `updateConfig`). The client bundle and proxy
 * route read them as constants; nothing user-configurable ships as a
 * runtime fetch or filesystem lookup.
 */

import { isSafeHttpUrl } from '@vizuh/clicktrail-core';

/** Vite define key holding the serialized client boot config. */
export const CLIENT_CONFIG_GLOBAL = '__CLICKTRAIL_CLIENT_CONFIG__';

/** Vite define key holding the serialized proxy route config. */
export const PROXY_CONFIG_GLOBAL = '__CLICKTRAIL_PROXY_CONFIG__';

/** Default first-party proxy pattern when the proxy is enabled. */
export const DEFAULT_PROXY_PATTERN = '/api/clicktrail';

/** Default browser event endpoint (the injected proxy route). */
export const DEFAULT_ENDPOINT = DEFAULT_PROXY_PATTERN;

export interface ClickTrailClientConfig {
  /** Event delivery endpoint. Default `/api/clicktrail`. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  consentRequired: boolean;
  debug: boolean;
}

export interface ClickTrailProxyConfig {
  /** Upstream collector URL events are forwarded to. Required when enabled. */
  upstream: string;
  /** Request headers forwarded upstream. Default: ['user-agent', 'referer']. */
  forwardHeaders: readonly string[];
  /** Maximum accepted request body in bytes. Default 65536. */
  maxBodyBytes: number;
  /** Maximum events per batch. Default 50. */
  maxBatchEvents: number;
}

const FORBIDDEN_FORWARD_HEADERS = new Set([
  'authorization',
  'cookie',
  'forwarded',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
]);

/** Validate build-time proxy settings before they reach a request handler. */
export function validateProxyConfig(config: ClickTrailProxyConfig): ClickTrailProxyConfig {
  if (!config.upstream || !isSafeHttpUrl(config.upstream)) {
    throw new Error('clicktrail proxy: upstream must be a public absolute https URL.');
  }
  if (!Number.isSafeInteger(config.maxBodyBytes) || config.maxBodyBytes < 1) {
    throw new Error('clicktrail proxy: maxBodyBytes must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(config.maxBatchEvents) || config.maxBatchEvents < 1) {
    throw new Error('clicktrail proxy: maxBatchEvents must be a positive safe integer.');
  }
  if (
    !Array.isArray(config.forwardHeaders) ||
    config.forwardHeaders.some(
      (name) =>
        typeof name !== 'string' ||
        !/^[a-z0-9-]+$/i.test(name) ||
        FORBIDDEN_FORWARD_HEADERS.has(name.toLowerCase()),
    )
  ) {
    throw new Error('clicktrail proxy: forwardHeaders contains an unsafe header name.');
  }
  return config;
}

export function defaultClientConfig(overrides: Partial<ClickTrailClientConfig> = {}): ClickTrailClientConfig {
  return {
    endpoint: DEFAULT_ENDPOINT,
    consentRequired: false,
    debug: false,
    ...overrides,
  };
}

export function defaultProxyConfig(overrides: Partial<ClickTrailProxyConfig> = {}): ClickTrailProxyConfig {
  return {
    upstream: '',
    forwardHeaders: ['user-agent', 'referer'],
    maxBodyBytes: 65_536,
    maxBatchEvents: 50,
    ...overrides,
  };
}
