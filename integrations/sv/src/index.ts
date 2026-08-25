/**
 * @clicktrail/sv — EXPERIMENTAL Svelte CLI community add-on.
 */
export {
  clicktrailAddon,
  default,
} from './addon.js';
export const SVELTEKIT_PACKAGE = '@clicktrail/sveltekit';
export {
  DEFAULT_SITE_ID_PLACEHOLDER,
  generateConversionEndpoint,
  generateEnv,
  generateHooksServer,
  generateRootLayout,
} from './generate.js';
export { defineAddon } from './types.js';
export type {
  AddonAnswers,
  AddonConditionContext,
  AddonFile,
  AddonMetadata,
  AddonQuestion,
  SvAddon,
} from './types.js';
