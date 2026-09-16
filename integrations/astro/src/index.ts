/**
 * @vizuh/clicktrail-astro — Astro integration factory.
 *
 * Injects the ClickTrail browser SDK into every page, adds an optional
 * first-party proxy route, and compiles user options into Vite define
 * globals consumed by `@vizuh/clicktrail-astro/client` and `./proxy`.
 *
 * Works in static, server-rendered (SSR), and hybrid output modes:
 * script injection and route injection are mode-independent. The proxy
 * route is always server-rendered (`prerender: false`).
 */
import type { AstroIntegration } from './types.js';
import {
  CLIENT_CONFIG_GLOBAL,
  DEFAULT_ENDPOINT,
  DEFAULT_PROXY_PATTERN,
  PROXY_CONFIG_GLOBAL,
  defaultClientConfig,
  defaultProxyConfig,
} from './config.js';
import type {
  ClickTrailClientConfig,
  ClickTrailClientCrossDomainConfig,
  ClickTrailClientStorageConfig,
  ClickTrailProxyConfig,
} from './config.js';

export interface ClickTrailAstroOptions {
  /** Site identifier copied into normalized marketing trail envelopes. */
  siteId?: string;
  /** Workspace identifier copied into normalized marketing trail envelopes. */
  workspaceId?: string;
  /**
   * Where the browser delivers events. Defaults to `/api/clicktrail`
   * (the injected first-party proxy). Pass an absolute https:// URL to
   * send directly to a remote collector without injecting a route.
   */
  endpoint?: string;
  /**
   * First-party proxy route. Enabled by default when `endpoint` is not an
   * absolute URL; set `false` to disable entirely. Requires `upstream`.
   */
  proxy?:
    | {
        /** Route pattern. Default '/api/clicktrail'. */
        pattern?: string;
        /** Upstream collector URL events are forwarded to. Required. */
        upstream: string;
        /** Request headers forwarded upstream. Default ['user-agent','referer']. */
        forwardHeaders?: readonly string[];
      }
    | false;
  /**
   * When true, no events or storage writes happen until consent is granted
   * (via `globalThis.__clicktrailSetConsent(true)` or the
   * `clicktrail:consent` CustomEvent). Default false.
   */
  consentRequired?: boolean;
  /** Log boot diagnostics to console. Default false. */
  debug?: boolean;
  /**
   * Serializable browser storage settings. Set `cookieDomain` to the shared
   * parent domain when continuity must cross approved sibling subdomains.
   */
  storage?: ClickTrailClientStorageConfig;
  /**
   * Approved sibling-subdomain continuation. Astro uses the shared cookie
   * signing key; configure `storage.cookieDomain` for cross-origin handoff.
   */
  crossDomain?: ClickTrailClientCrossDomainConfig | false;
}

function isAbsoluteEndpoint(endpoint: string): boolean {
  return /^https?:\/\//i.test(endpoint);
}

export function clicktrailAstro(options: ClickTrailAstroOptions = {}): AstroIntegration {
  if (options.storage?.cookieDomain !== undefined) {
    if (
      typeof options.storage.cookieDomain !== 'string' ||
      options.storage.cookieDomain.trim() === '' ||
      options.storage.cookieDomain.includes('/') ||
      options.storage.cookieDomain.includes('@')
    ) {
      throw new TypeError('clicktrailAstro: storage.cookieDomain must be a host name.');
    }
  }
  if (
    options.storage?.retentionDays !== undefined &&
    (!Number.isSafeInteger(options.storage.retentionDays) ||
      options.storage.retentionDays < 1 ||
      options.storage.retentionDays > 400)
  ) {
    throw new RangeError('clicktrailAstro: storage.retentionDays must be an integer from 1 through 400.');
  }
  if (options.crossDomain && (
    !Array.isArray(options.crossDomain.domains) ||
    options.crossDomain.domains.length === 0 ||
    options.crossDomain.domains.some(
      (domain) => typeof domain !== 'string' || domain.trim() === '' || domain.includes('/') || domain.includes('@'),
    )
  )) {
    throw new TypeError('clicktrailAstro: crossDomain.domains must contain host names.');
  }
  if (options.crossDomain && !options.storage?.cookieDomain) {
    throw new TypeError(
      'clicktrailAstro: crossDomain requires storage.cookieDomain so approved sibling subdomains share the signing key.',
    );
  }

  const clientCfg: ClickTrailClientConfig = defaultClientConfig({
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    ...(options.siteId !== undefined ? { siteId: options.siteId } : {}),
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    ...(options.consentRequired !== undefined ? { consentRequired: options.consentRequired } : {}),
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
    ...(options.storage !== undefined ? { storage: options.storage } : {}),
    ...(options.crossDomain !== undefined ? { crossDomain: options.crossDomain } : {}),
  });

  const wantsRoute =
    options.proxy !== false &&
    !isAbsoluteEndpoint(clientCfg.endpoint) &&
    (options.proxy === undefined || typeof options.proxy === 'object');

  const proxyCfg: ClickTrailProxyConfig | null =
    options.proxy && options.proxy.upstream
      ? defaultProxyConfig({
          upstream: options.proxy.upstream,
          ...(options.proxy.forwardHeaders !== undefined
            ? { forwardHeaders: options.proxy.forwardHeaders }
            : {}),
        })
      : null;

  if (wantsRoute && proxyCfg === null) {
    throw new TypeError(
      "clicktrailAstro: the first-party proxy needs `proxy.upstream`. " +
        "Set it, pass an absolute `endpoint`, or set `proxy: false`.",
    );
  }

  return {
    name: '@vizuh/clicktrail-astro',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript, injectRoute }) => {
        updateConfig({
          vite: {
            define: {
              [CLIENT_CONFIG_GLOBAL]: JSON.stringify(clientCfg),
              [PROXY_CONFIG_GLOBAL]: JSON.stringify(proxyCfg ?? defaultProxyConfig()),
            },
          },
        });

        injectScript({
          pattern: 'page',
          entrypoint: '@vizuh/clicktrail-astro/client',
        });

        if (wantsRoute && proxyCfg !== null) {
          injectRoute({
            pattern: (options.proxy as NonNullable<ClickTrailAstroOptions['proxy']> & object)?.pattern ?? DEFAULT_PROXY_PATTERN,
            entrypoint: '@vizuh/clicktrail-astro/proxy',
            prerender: false,
          });
        }
      },
    },
  };
}

export default clicktrailAstro;
