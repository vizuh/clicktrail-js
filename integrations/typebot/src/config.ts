/**
 * Block configuration.
 *
 * Pure resolution only — no side effects at import time. All effects
 * (network send, clock) are injected by the factory in index.ts, so event
 * builders stay pure functions of (mappedVariables, config).
 */

export interface TypebotBlockConfig {
  /**
   * First-party ClickTrail endpoint. Relative paths (default '/api/clicktrail')
   * are posted as-is from the browser (same-origin proxy); absolute
   * HTTPS URLs are allowed for direct-to-collector setups.
   */
  endpoint?: string;
  /** ClickTrail site id this conversation belongs to. */
  siteId?: string;
  /** ClickTrail workspace id (optional; server can derive it from siteId). */
  workspaceId?: string;
  /**
   * Optional API key sent as the `X-ClickTrail-Key` header when the endpoint
   * requires it. Never logged and never included in event bodies.
   */
  apiKey?: string;
  /** When true, the factory logs each send outcome through deps.log. */
  debug?: boolean;
}

export const DEFAULT_ENDPOINT = '/api/clicktrail';

export interface ResolvedTypebotBlockConfig {
  readonly endpoint: string;
  readonly siteId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly debug: boolean;
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Resolve user config into a frozen, fully-trimmed shape. */
export function resolveTypebotBlockConfig(
  config: TypebotBlockConfig = {},
): ResolvedTypebotBlockConfig {
  const endpoint = cleanOptional(config.endpoint) ?? DEFAULT_ENDPOINT;
  const rootRelative = endpoint.startsWith('/') && !endpoint.startsWith('//');
  let secureAbsolute = false;
  try {
    const parsed = new URL(endpoint);
    secureAbsolute = parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    // Root-relative endpoints are validated without a base URL.
  }
  if (!rootRelative && !secureAbsolute) {
    throw new TypeError('typebot-block.endpoint must be absolute https or a root-relative path');
  }
  return Object.freeze({
    endpoint,
    siteId: cleanOptional(config.siteId),
    workspaceId: cleanOptional(config.workspaceId),
    apiKey: cleanOptional(config.apiKey),
    debug: config.debug === true,
  });
}
