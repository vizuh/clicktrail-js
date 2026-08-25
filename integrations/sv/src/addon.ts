/**
 * EXPERIMENTAL Svelte CLI community add-on for ClickTrail.
 *
 * defineAddon-style object with id 'clicktrail': metadata, questions
 * (siteId prompt), condition, files to apply, and a postInstall hint.
 * The sv add-on contract is NOT stable upstream yet — this definition
 * mirrors it structurally and may change without a semver break while
 * marked EXPERIMENTAL. See UPSTREAM-ISSUE-DRAFT.md.
 */
import { defineAddon } from './types.js';
import type { SvAddon } from './types.js';
import {
  generateConversionEndpoint,
  generateEnv,
  generateHooksServer,
  generateRootLayout,
} from './generate.js';

/** Dependency installed by the postInstall hint. */
export const SVELTEKIT_PACKAGE = '@clicktrail/sveltekit';

export const clicktrailAddon: SvAddon = defineAddon({
  id: 'clicktrail',
  metadata: {
    name: 'ClickTrail',
    description:
      'First-party attribution and conversion tracking via @clicktrail/sveltekit: landing UTMs + click IDs in a first-party cookie, consent-gated page views, optional first-party proxy, and server-side conversions.',
    keywords: ['attribution', 'analytics', 'utm', 'gclid', 'fbclid', 'conversion-tracking'],
  },
  condition: ({ kit }) => kit,
  questions: [
    {
      id: 'siteId',
      question: 'What is your ClickTrail site ID? (leave empty to fill in later via .env)',
      type: 'string',
      default: '',
      required: false,
      placeholder: 'e.g. my-site',
    },
  ],
  files: [
    {
      name: 'hooks.server.ts',
      content: (answers) => generateHooksServer(answers),
    },
    {
      name: 'src/routes/+layout.svelte',
      content: () => generateRootLayout(),
    },
    {
      name: '.env.clicktrail',
      content: (answers) => generateEnv(answers),
    },
    {
      name: 'src/routes/api/clicktrail-example/+server.ts',
      content: (answers) => generateConversionEndpoint(answers),
    },
  ],
  postInstall: `npm i ${SVELTEKIT_PACKAGE}`,
});

export default clicktrailAddon;
