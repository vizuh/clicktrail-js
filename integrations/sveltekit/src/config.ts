/**
 * Shared configuration contract for the SvelteKit integration.
 *
 * The handle factory and the client boot module consume the same option
 * object; nothing user-configurable ships as a runtime fetch or filesystem
 * lookup. Proxy settings are validated before they reach a request handler.
 */

import { FORBIDDEN_FORWARD_HEADERS } from './forward-headers.js';

/** Default first-party proxy pattern when the proxy is enabled. */
export const DEFAULT_PROXY_PATTERN = '/api/clicktrail';

/** Default event endpoint (the proxy pattern). */
export const DEFAULT_ENDPOINT = DEFAULT_PROXY_PATTERN;

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

/** Validate proxy settings before they reach a request handler. */
export function validateProxyConfig(config: ClickTrailProxyConfig): ClickTrailProxyConfig {
  if (!config.upstream || !/^https?:\/\//i.test(config.upstream)) {
    throw new Error('clicktrail proxy: upstream must be an absolute http(s) URL.');
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

/** Options accepted by the handle factory and shared with the client boot. */
export interface ClickTrailSvelteKitOptions {
  /** Site identifier copied into normalized marketing trail envelopes. */
  siteId?: string;
  /** Workspace identifier copied into normalized marketing trail envelopes. */
  workspaceId?: string;
  /**
   * Where the browser delivers events. Default '/api/clicktrail'. Pass an
   * absolute https:// URL to send directly to a remote collector.
   */
  endpoint?: string;
  /**
   * When true, nothing is persisted (attribution cookie) or tracked until
   * consent is granted via the `ct_consent` cookie. Default false. An
   * explicit 'denied' consent cookie suppresses tracking even when false.
   */
  consentRequired?: boolean;
  /** Track page views across client navigations. Default true. */
  trackPageViews?: boolean;
  /**
   * First-party proxy. When enabled and the request path matches the proxy
   * pattern (default '/api/clicktrail'), requests short-circuit into the
   * proxy handler instead of resolve(). Set false to disable entirely.
   */
  proxy?:
    | {
        /** Path matched against request.url.pathname. Default '/api/clicktrail'. */
        pattern?: string;
        /** Upstream collector URL events are forwarded to. Required. */
        upstream: string;
        /** Request headers forwarded upstream. Default ['user-agent','referer']. */
        forwardHeaders?: readonly string[];
      }
    | false;
  /**
   * Injected fetch implementation for the proxy handler. Default: globalThis
   * fetch. Tests and hosts can override to avoid live upstream calls.
   */
  fetch?: typeof fetch;
}
