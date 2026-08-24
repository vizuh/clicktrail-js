/**
 * Ambient RuntimeConfig augmentation for Nuxt consumers.
 *
 * Shapes mirror ClickTrailPublicRuntimeConfig / ClickTrailServerRuntimeConfig
 * in src/types.ts. Shipped in dist typings so a host app's
 * useRuntimeConfig() sees the `clicktrail` (public) and `clicktrailServer`
 * keys once this package is installed. Deliberately import-free: it must
 * load as an ambient script even without Nuxt present.
 */
declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    /** Populated by @vizuh/clicktrail-nuxt from module options. */
    clicktrail?: {
      endpoint: string;
      siteId?: string;
      workspaceId?: string;
      consentRequired?: boolean;
      trackPageViews?: boolean;
      captureClickIds?: boolean;
      debug?: boolean;
    };
  }
  interface RuntimeConfig {
    /** Server-only slice written by @vizuh/clicktrail-nuxt. */
    clicktrailServer?: {
      proxy: {
        upstream: string;
        forwardHeaders?: readonly string[];
      } | null;
    };
  }
}
