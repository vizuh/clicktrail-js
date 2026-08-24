/**
 * Structural mirrors of the Directus extension surfaces this package uses.
 *
 * Zero `directus` imports anywhere: the server pieces are plain JS objects
 * at runtime and the app pieces are hand-rolled Vue bundles. These types
 * exist only so `tsc --strict` can check our side of the contract.
 */

export interface Logger {
  info(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
}

/** Minimal mirror of the Directus ItemsService surface the hook touches. */
export interface ItemsService {
  createOne(data: Record<string, unknown>): Promise<string | number>;
}

export interface ApiExtensionContext {
  services?: { ItemsService?: new (options: Record<string, unknown>) => ItemsService };
  logger?: Logger;
  env?: Record<string, string | undefined>;
  getSchema?: () => Promise<unknown>;
  database?: unknown;
}

/** Config bag a Flow operation receives from the Flow designer. */
export interface OperationConfig {
  eventName?: unknown;
  payload?: unknown;
  siteId?: unknown;
  workspaceId?: unknown;
  consentAnalytics?: unknown;
  consentAdvertising?: unknown;
  endpoint?: unknown;
  apiKey?: unknown;
}

export interface HookMeta {
  collection?: unknown;
  event?: unknown;
  keys?: unknown;
}

export type FilterHandler = (
  payload: Record<string, unknown>,
  meta: HookMeta,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export interface HookRegistration {
  filter(event: string, handler: FilterHandler): void;
}

export interface HookFactoryContext {
  filter?: HookRegistration['filter'];
  action?: (event: string, handler: (...args: unknown[]) => void) => void;
}
