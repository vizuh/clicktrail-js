# @clicktrail/site

Product landing page for [ClickTrail](https://github.com/vizuh/clicktrail-js),
built with Astro as a fully static site. It also demonstrates ClickTrail
tracking its own page views in the browser.

## Commands

This directory has its own package.json and lockfile, outside the repo's
pnpm workspace (`packages/*` only). Because the repo root is a workspace,
install with:

```sh
pnpm install --ignore-workspace   # run inside site/
pnpm dev                          # local dev server
pnpm build     # static build to dist/
pnpm preview   # serve the built output
```

## Tracking on this site

The site self-tracks via the prebuilt browser bundle (`public/clicktrail.global.js`,
copied from `packages/clicktrail/dist/clicktrail.global.js`) loaded in
`src/layouts/Layout.astro`. The boot script creates an instance with a GTM
`dataLayer` destination plus a console mirror, tracks `page_view` events, and
re-parses attribution touches across navigations (URL-keyed dedupe,
first-touch preserved / last-touch merged) — the same logic
`@vizuh/clicktrail-astro` performs through its injected client.

**Why not the `@vizuh/clicktrail-astro` integration here?** The integration's client
hardcodes an HTTP destination pointing at `/api/clicktrail` and exposes no
option to choose a console or dataLayer destination. On a purely static host
that endpoint has no server behind it. Per the fallback plan for this site,
the global bundle is loaded directly with a dataLayer destination instead.
For sites with a backend or collector, use `@vizuh/clicktrail-astro` directly.

## Deploy

Any static host works (GitHub Pages, Cloudflare Pages, Netlify): run
`pnpm build` inside this directory and serve `dist/`. No SSR adapter, no
server routes.

## Brand tokens

Colors, font stack, radii, and shadow are extracted verbatim from
`../product-hunt/tokens.css`; the visual language (kicker bars, accent-edged
panels, ring ornament) follows `../product-hunt/gallery.html`.
