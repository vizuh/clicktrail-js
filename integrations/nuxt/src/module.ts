/**
 * @vizuh/clicktrail-nuxt — Nuxt module factory.
 *
 * Writes user options into runtimeConfig (`public.clicktrail` client-side,
 * `clicktrailServer` server-only), registers the client plugin, and adds
 * the first-party Nitro proxy route when enabled. Zero `nuxt`/kit imports:
 * the module object and install context are structural mirrors of nuxt@3.
 */
import {
  CLIENT_PLUGIN_ENTRY,
  CONFIG_KEY,
  DEFAULT_ENDPOINT,
  DEFAULT_PROXY_PATTERN,
  MODULE_NAME,
  MODULE_VERSION,
  PROXY_HANDLER_ENTRY,
  defaultProxyConfig,
} from './config.js';
import type { ClickTrailProxyConfig } from './config.js';
import type {
  ClickTrailPublicRuntimeConfig,
  ClickTrailServerRuntimeConfig,
  ClicktrailNuxtModule,
  NuxtContextLike,
} from './types.js';

export interface ClickTrailNuxtOptions {
  /** Site identifier copied into normalized marketing trail envelopes. */
  siteId?: string;
  /** Workspace identifier copied into normalized marketing trail envelopes. */
  workspaceId?: string;
  /**
   * Where the browser delivers events. Defaults to `/api/clicktrail`
   * (the registered first-party proxy). Pass an absolute https:// URL to
   * send directly to a remote collector without registering a route.
   */
  endpoint?: string;
  /**
   * When true, no events or storage writes happen until consent is granted
   * via `useClicktrail().setConsent(true)` or the `clicktrail:consent`
   * custom event. Default false.
   */
  consentRequired?: boolean;
  /** Track router navigations as page views. Default true. */
  trackPageViews?: boolean;
  /** Merge attribution touches per URL change. Default true. */
  captureClickIds?: boolean;
  /**
   * First-party proxy route. Same semantics as the Astro package:
   * - object form requires `upstream` (TypeError otherwise)
   * - omitted + relative `endpoint`: enabled by default and therefore also
   *   requires `upstream` (TypeError otherwise)
   * - `true`: enable with defaults; provide the upstream at request time
   *   via `globalThis.__CLICKTRAIL_NUXT_PROXY__` or the server runtimeConfig
   * - `false` or an absolute `endpoint`: disabled entirely.
   */
  firstPartyProxy?:
    | boolean
    | {
        /** Route pattern. Default '/api/clicktrail'. */
        pattern?: string;
        /** Upstream collector URL events are forwarded to. */
        upstream: string;
        /** Request headers forwarded upstream. Default ['user-agent','referer']. */
        forwardHeaders?: readonly string[];
      };
  /** Log boot diagnostics to console. Default false. */
  debug?: boolean;
}

function isAbsoluteEndpoint(endpoint: string): boolean {
  return /^https?:\/\//i.test(endpoint);
}

const UPSTREAM_ERROR =
  "@vizuh/clicktrail-nuxt: the first-party proxy needs `firstPartyProxy.upstream`. " +
  "Set it, pass an absolute `endpoint`, set `firstPartyProxy: true` to configure " +
  "the upstream at runtime, or set `firstPartyProxy: false`.";

/**
 * Build the module. Options given here win over options read from the
 * `clicktrail` key in nuxt.config (passed into setup() by Nuxt).
 */
export function defineClicktrailModule(
  options: ClickTrailNuxtOptions = {},
): ClicktrailNuxtModule {
  // Proxy-route decision happens at factory time so misconfiguration
  // throws immediately at build start, exactly like the Astro integration.
  const proxyOption = options.firstPartyProxy;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const wantsRoute =
    proxyOption !== false &&
    !isAbsoluteEndpoint(endpoint) &&
    (proxyOption === undefined || typeof proxyOption === 'object' || proxyOption === true);

  let proxyCfg: ClickTrailProxyConfig | null = null;
  if (typeof proxyOption === 'object' && proxyOption !== null) {
    if (!proxyOption.upstream) throw new TypeError(UPSTREAM_ERROR);
    proxyCfg = defaultProxyConfig({
      upstream: proxyOption.upstream,
      ...(proxyOption.forwardHeaders !== undefined
        ? { forwardHeaders: proxyOption.forwardHeaders }
        : {}),
    });
  } else if (proxyOption === undefined && wantsRoute) {
    throw new TypeError(UPSTREAM_ERROR);
  } else if (proxyOption === true) {
    // Upstream resolved per-request by the Nitro handler; empty means
    // "not configured yet" and serves 502 until provided.
    proxyCfg = defaultProxyConfig();
  }

  const pattern =
    typeof proxyOption === 'object' && proxyOption !== null && proxyOption.pattern
      ? proxyOption.pattern
      : DEFAULT_PROXY_PATTERN;

  return {
    name: MODULE_NAME,
    configKey: CONFIG_KEY,
    version: MODULE_VERSION,
    setup(moduleOptions: unknown, nuxt: NuxtContextLike): void {
      const fromConfig = normalizeOptions(moduleOptions);
      const siteId = options.siteId ?? fromConfig.siteId;
      const workspaceId = options.workspaceId ?? fromConfig.workspaceId;
      const consentRequired = options.consentRequired ?? fromConfig.consentRequired ?? false;
      const trackPageViews = options.trackPageViews ?? fromConfig.trackPageViews ?? true;
      const captureClickIds = options.captureClickIds ?? fromConfig.captureClickIds ?? true;
      const debug = options.debug ?? fromConfig.debug ?? false;

      const clientCfg: ClickTrailPublicRuntimeConfig = {
        endpoint: options.endpoint ?? fromConfig.endpoint ?? DEFAULT_ENDPOINT,
        consentRequired,
        trackPageViews,
        captureClickIds,
        debug,
        ...(siteId !== undefined ? { siteId } : {}),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
      };

      const rc = nuxt.options.runtimeConfig;
      if (!rc.public) rc.public = {};
      rc.public['clicktrail'] = clientCfg;
      rc['clicktrailServer'] = {
        proxy: proxyCfg
          ? { upstream: proxyCfg.upstream, forwardHeaders: [...proxyCfg.forwardHeaders] }
          : null,
      } satisfies ClickTrailServerRuntimeConfig;

      nuxt.addPlugin({ src: CLIENT_PLUGIN_ENTRY, mode: 'client' });

      if (wantsRoute && proxyCfg !== null) {
        nuxt.addServerHandler({ route: pattern, handler: PROXY_HANDLER_ENTRY });
      }
    },
  };
}

function normalizeOptions(raw: unknown): Partial<ClickTrailNuxtOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return raw as Partial<ClickTrailNuxtOptions>;
}

export default defineClicktrailModule;
