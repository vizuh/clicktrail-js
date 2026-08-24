/**
 * @clicktrail/astro — Astro integration factory.
 *
 * Injects the ClickTrail browser SDK into every page, adds an optional
 * first-party proxy route, and compiles user options into Vite define
 * globals consumed by `@clicktrail/astro/client` and `./proxy`.
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
import type { ClickTrailClientConfig, ClickTrailProxyConfig } from './config.js';

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
}

function isAbsoluteEndpoint(endpoint: string): boolean {
  return /^https?:\/\//i.test(endpoint);
}

export function clicktrailAstro(options: ClickTrailAstroOptions = {}): AstroIntegration {
  const clientCfg: ClickTrailClientConfig = defaultClientConfig({
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    ...(options.siteId !== undefined ? { siteId: options.siteId } : {}),
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    ...(options.consentRequired !== undefined ? { consentRequired: options.consentRequired } : {}),
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
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
    name: '@clicktrail/astro',
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
          entrypoint: '@clicktrail/astro/client',
        });

        if (wantsRoute && proxyCfg !== null) {
          injectRoute({
            pattern: (options.proxy as NonNullable<ClickTrailAstroOptions['proxy']> & object)?.pattern ?? DEFAULT_PROXY_PATTERN,
            entrypoint: '@clicktrail/astro/proxy',
            prerender: false,
          });
        }
      },
    },
  };
}

export default clicktrailAstro;
