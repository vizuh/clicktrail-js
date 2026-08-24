/**
 * @clicktrail/nuxt plugin entry registered via addPlugin(mode: 'client').
 *
 * Thin re-export of the runtime entry so the registered specifier stays
 * stable (`@clicktrail/nuxt/plugin`) while the implementation lives in
 * ./runtime/plugin.client.ts.
 */
export { default } from '../runtime/plugin.client.js';
