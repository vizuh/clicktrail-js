// @ts-check
import { defineConfig } from 'astro/config';

// Static output only: no SSR adapter, no server routes. The ClickTrail
// tracking demo runs from the prebuilt global bundle in public/ (see
// src/layouts/Layout.astro and README.md) so every event stays observable
// in-page via the GTM dataLayer instead of POSTing to a backend that a
// static host does not have.
export default defineConfig({
  output: 'static',
});
