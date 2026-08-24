/**
 * Structural Astro integration types.
 *
 * Zero `astro` imports (same discipline as the /otel subpath: zero OTel
 * imports). The shapes below mirror astro@4/5 `AstroIntegration` closely
 * enough that the factory return value satisfies the real interface, but
 * the package builds and tests without astro installed. A peerDependency
 * entry documents the runtime expectation for consumers.
 */

export interface AstroIntegrationLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface InjectedScript {
  pattern: 'before-hydration' | 'head-inline' | 'page' | 'after-hydration';
  content?: string;
  entrypoint?: string;
}

export interface InjectedRoute {
  pattern: string;
  entrypoint: string;
  prerender?: boolean;
  priority?: number;
}

export interface AstroConfigLike {
  vite?: {
    define?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ConfigSetupParameters {
  config: AstroConfigLike;
  updateConfig: (newConfig: Partial<AstroConfigLike>) => void;
  injectScript: (script: InjectedScript) => void;
  injectRoute: (route: InjectedRoute) => void;
  logger: AstroIntegrationLogger;
  [key: string]: unknown;
}

export interface AstroIntegration {
  name: string;
  hooks: {
    'astro:config:setup': (params: ConfigSetupParameters) => void | Promise<void>;
  };
}
