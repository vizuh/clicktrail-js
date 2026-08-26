/**
 * Shared configuration contract + entry-point constants for the module,
 * the client plugin, and the injected Nitro proxy handler.
 *
 * Unlike the Astro integration there are no compile-time define globals:
 * Nuxt passes options through the module factory into runtimeConfig, so
 * everything here is plain runtime data validated at registration time.
 */

import { isSafeHttpUrl } from '@vizuh/clicktrail-core';

/** Module identity used by Nuxt's module catalog and configKey merging. */
export const MODULE_NAME = '@vizuh/clicktrail-nuxt';

/** nuxt.config key holding module options (top-level key). */
export const CONFIG_KEY = 'clicktrail';

/** Package version stamped onto the module object. */
export const MODULE_VERSION = '0.1.0-rc.4';

/** Default first-party proxy pattern when the proxy is enabled. */
export const DEFAULT_PROXY_PATTERN = '/api/clicktrail';

/** Default browser event endpoint (the registered proxy route). */
export const DEFAULT_ENDPOINT = DEFAULT_PROXY_PATTERN;

/** Client plugin entry registered via `addPlugin(mode: 'client')`. */
export const CLIENT_PLUGIN_ENTRY = '@vizuh/clicktrail-nuxt/plugin';

/** Nitro server-handler entry registered via `addServerHandler`. */
export const PROXY_HANDLER_ENTRY = '@vizuh/clicktrail-nuxt/runtime/proxy.handler';

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

/** Validate proxy settings before they reach a request handler. */
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

export function defaultProxyConfig(overrides: Partial<ClickTrailProxyConfig> = {}): ClickTrailProxyConfig {
  return {
    upstream: '',
    forwardHeaders: ['user-agent', 'referer'],
    maxBodyBytes: 65_536,
    maxBatchEvents: 50,
    ...overrides,
  };
}
