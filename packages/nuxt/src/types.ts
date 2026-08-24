/**
 * Structural Nuxt module + runtime types.
 *
 * Zero `nuxt` / `@nuxt/kit` / `vue` / `nitropack` imports (same discipline
 * as packages/astro/src/types.ts and the /otel subpath). The shapes below
 * mirror nuxt@3 closely enough that the factory return value satisfies the
 * real module-object contract, but the package builds and tests without
 * Nuxt installed. The peerDependency entries document the runtime
 * expectation for consumers.
 */

/** Public (client-visible) runtime-config slice written by the module. */
export interface ClickTrailPublicRuntimeConfig {
  /** Event delivery endpoint. Default `/api/clicktrail`. */
  endpoint: string;
  /** Site identifier copied into normalized marketing trail envelopes. */
  siteId?: string;
  /** Workspace identifier copied into normalized marketing trail envelopes. */
  workspaceId?: string;
  /** Defer boot until consent is granted. Default false. */
  consentRequired: boolean;
  /** Track router navigations as page views. Default true. */
  trackPageViews: boolean;
  /** Merge attribution touches per URL change. Default true. */
  captureClickIds: boolean;
  /** Log boot diagnostics to console. Default false. */
  debug: boolean;
}

/** Server-only runtime-config slice written by the module. */
export interface ClickTrailServerRuntimeConfig {
  /**
   * First-party proxy settings; `null` when the proxy route is disabled.
   * An empty `upstream` means "resolved at request time" (the
   * `firstPartyProxy: true` option form) — the handler serves 502 until
   * an upstream is configured via `globalThis.__CLICKTRAIL_NUXT_PROXY__`.
   */
  proxy: {
    upstream: string;
    forwardHeaders: readonly string[];
  } | null;
}

export interface NuxtRuntimeConfigLike {
  public?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NuxtOptionsLike {
  runtimeConfig: NuxtRuntimeConfigLike;
  [key: string]: unknown;
}

export interface PluginRegistrationLike {
  src: string;
  mode?: 'client' | 'server' | 'all';
  [key: string]: unknown;
}

export interface ServerHandlerRegistrationLike {
  route?: string;
  handler: string;
  middleware?: boolean;
  [key: string]: unknown;
}

/**
 * Second argument of a Nuxt module's setup(), structurally mirrored.
 * In a real Nuxt build `addPlugin`/`addServerHandler` come from the module
 * install context (@nuxt/kit); this package never imports kit APIs.
 */
export interface NuxtContextLike {
  options: NuxtOptionsLike;
  addPlugin: (plugin: string | PluginRegistrationLike) => void;
  addServerHandler: (handler: ServerHandlerRegistrationLike) => void;
  [key: string]: unknown;
}

/** Nuxt module object, structurally mirrored (setup-style hook). */
export interface ClicktrailNuxtModule {
  name: string;
  configKey: string;
  version: string;
  setup: (moduleOptions: unknown, nuxt: NuxtContextLike) => void;
}

/** Nuxt plugin object, structurally mirrored (what addPlugin registers). */
export interface NuxtPluginObjectLike {
  name?: string;
  setup: (nuxtApp: NuxtAppLike) => void;
}

/** First argument of a client plugin's setup(), structurally mirrored. */
export interface NuxtAppLike {
  provide?: (name: string, value: unknown) => void;
  payload?: {
    config?: {
      public?: Record<string, unknown>;
      clicktrailServer?: unknown;
    };
  };
  $router?: unknown;
  [key: string]: unknown;
}

/**
 * Structural H3/Nitro event-handler mirror. H3 handlers are callable
 * functions over fetch-style requests in Nitro's modern Request-in /
 * Response-out surface, so a plain function type is the honest mirror.
 */
export type NitroEventHandler = (request: Request) => Promise<Response>;
