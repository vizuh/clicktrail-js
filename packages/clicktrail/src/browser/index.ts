/**
 * @funnelsheet/clicktrail/browser — thin browser layer.
 *
 * Effects live here (clock/network/dataLayer), built against the frozen
 * deterministic core. Import-safe in SSR environments: no side effects
 * until createClickTrail(...).start().
 */
export { buildEventPayload } from './serialize.js';
export type { ClickTrailEvent } from './serialize.js';
export { httpDestination, dataLayerDestination } from './transport.js';
export type {
  Destination,
  SendFn,
  HttpDestinationConfig,
  DataLayerDestinationConfig,
} from './transport.js';
export { createLegacyGlobal } from './global-adapter.js';
export type {
  LegacyGlobalApi,
  LegacyGlobalInstance,
  SessionSnapshot,
} from './global-adapter.js';
export { createClickTrail } from './create-clicktrail.js';
export type {
  ClickTrailConfig,
  ClickTrailInstance,
  DiagnosticsLevel,
} from './create-clicktrail.js';
