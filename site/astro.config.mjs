// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: PLACEHOLDER DOMAIN — `site` below is a placeholder. Swap it (and the
// canonical base in src/layouts/Layout.astro) when the production domain is live.
// Static output only: no SSR adapter, no server routes. The ClickTrail
// tracking demo runs from the prebuilt global bundle in public/ (see
// src/layouts/Layout.astro and README.md) so every event stays observable
// in-page via the GTM dataLayer instead of POSTing to a backend that a
// static host does not have.
export default defineConfig({
  output: 'static',
  site: 'https://clicktrail.dev',
  integrations: [sitemap()],
});
