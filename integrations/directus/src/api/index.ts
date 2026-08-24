/**
 * Server-side entrypoint (main). Exports the Flow operation and the API
 * hook as plain JS objects/functions — no directus runtime import needed.
 */
export {
  OPERATION_ID,
  createSendEventHandler,
  sendEventHandler,
  operation,
  default as operationDefault,
} from './operation.js';
export type { OperationResult, OperationDeps, OperationManifest } from './operation.js';
export {
  LOCAL_EVENT_COLLECTION,
  configuredCollections,
  resolveHookTarget,
  eventToStoredRow,
  createClickTrailHook,
  hook,
} from './hook.js';
export { DEFAULT_COLLECTIONS } from '../lib/mapping.js';
export type { HookConfig, HookDeps } from './hook.js';
