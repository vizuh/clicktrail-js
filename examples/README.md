# ClickTrail examples

Runnable and copy-only examples for `@vizuh/clicktrail`. Everything here is
dependency-light on purpose: no install step is required except building the
SDK once.

| Example | Kind | What you learn | Run |
|---|---|---|---|
| [`node-replay/`](node-replay/) | Runnable (node >= 18) | Deterministic replay: landing URL → classified touch → flat `ft_*`/`lt_*` payload, printed as JSON. | `pnpm --filter @vizuh/clicktrail build && node examples/node-replay/replay.mjs` |
| [`static-page/`](static-page/) | Runnable (browser) | Zero-tooling page using the IIFE bundle: dataLayer destination + consent checkbox driving `start()`/`stop()`. Built bundle is committed in-folder. | open `examples/static-page/index.html`, or `npx serve examples/static-page` |
| [`gtm-datalayer/`](gtm-datalayer/) | Copy-only recipe | How to read ClickTrail pushes in GTM: push shape, data-layer variables (`event_name`, `marketing_trail.trail_id`, `ft_source`/`lt_source`, `click_ids.gclid`), trigger config, PII warning. | copy snippets into your integration layer |
| [`astro-demo/`](astro-demo/) | Documentation-only walkthrough | The official Astro integration in one page: `astro.config.mjs` snippet, condensed options table, consent gating, server-side conversions. Full starter: [`../site/`](../site/). | follow along in your Astro project |

## Prerequisite

The runnable examples import/copy the **built** package. Build once from the
repo root:

```bash
pnpm --filter @vizuh/clicktrail build          # dist/index.js (ESM)
pnpm --filter @vizuh/clicktrail build:global   # dist/clicktrail.global.js (IIFE)
```

`static-page/` already contains a committed copy of the built global bundle,
so that demo works with no build step at all.
