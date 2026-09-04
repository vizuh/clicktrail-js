# @vizuh/clicktrail-astro


First-party attribution and conversion tracking for [Astro](https://astro.build).

Injects the ClickTrail browser SDK (`@vizuh/clicktrail`), tracks page views across Astro view transitions without duplicates, preserves first-touch/last-touch attribution on every navigation, gates all tracking behind consent when configured, adds an optional first-party proxy endpoint, and ships server-side helpers for leads, bookings, and purchases.

Works in static, server-rendered (SSR), and hybrid output modes.

## Install

```sh
npx astro add @vizuh/clicktrail-astro
# or
npm install @vizuh/clicktrail-astro
```

Then add the integration:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import clicktrail from '@vizuh/clicktrail-astro';

export default defineConfig({
  integrations: [
    clicktrail({
      siteId: 'my-site',
      proxy: { upstream: 'https://collector.example.com/v1/events' },
    }),
  ],
});
```

## What it does

| Requirement | How |
|---|---|
| Browser SDK injection | A `page` pattern script imports `@vizuh/clicktrail-astro/client` into every page. |
| Static / SSR / hybrid | Script + route injection are output-mode independent; the proxy route is always server-rendered. |
| View transitions | Page views listen to `astro:page-load`; a URL-keyed dedupe prevents duplicate events for the same document. |
| First/last-touch attribution | Every navigation re-parses the landing URL and merges touches through the SDK's canonical payload store (`ft_*` preserved, `lt_*` updated). |
| No duplicate page views | Same pathname+search never emits twice within one document; real reloads correctly count again. |
| First-party proxy | Injects `POST /api/clicktrail`, forwards bounded batches upstream, strips visitor IPs, allowlists forwarded headers. |
| Consent gating | With `consentRequired: true`, nothing starts or persists until `globalThis.__clicktrailSetConsent(true)` runs (or the `clicktrail:consent` event fires with a granted flag). Pre-consent navigations merge touches in memory only — no cookies or storage writes. |
| Server-side conversions | `@vizuh/clicktrail-astro/server` exports `ClickTrailServer` with `trackLead`, `trackBooking`, `trackPurchase`. |

## Options

```ts
interface ClickTrailAstroOptions {
  siteId?: string;            // copied into normalized envelopes
  workspaceId?: string;
  endpoint?: string;          // default '/api/clicktrail'; absolute https:// URLs skip route injection
  proxy?:
    | { pattern?: string;     // default '/api/clicktrail'
        upstream: string;     // required collector URL
        forwardHeaders?: readonly string[] } // default ['user-agent', 'referer']
    | false;
  consentRequired?: boolean;  // default false
  debug?: boolean;            // default false
}
```

## Consent

```html
<script>
  // call from your CMP's accept callback:
  globalThis.__clicktrailSetConsent?.(true);
</script>
```

Denying (`__clicktrailSetConsent(false)`) before grant leaves no persisted state; the SDK's denial path also wipes attribution storage.

## Server-side conversions

In an API route or action handler:

```ts
import { ClickTrailServer, parseIdentityFromCookies } from '@vizuh/clicktrail-astro/server';

const server = new ClickTrailServer({
  endpoint: 'https://collector.example.com/v1/events',
  siteId: 'my-site',
});

export const POST: APIRoute = async ({ request }) => {
  const identity = parseIdentityFromCookies(request.headers.get('cookie'));
  await server.trackPurchase({
    identity,
    data: { transactionId: 't-1234', value: 49.9, currency: 'EUR' },
  });
  return new Response(null, { status: 204 });
};
```

`trackPurchase` validates that `transactionId`, `value`, and `currency` are present and well-formed before sending. Delivery failures resolve to `{ ok: false }` instead of throwing so an analytics outage never breaks checkout.

## Related packages

- [`@vizuh/clicktrail`](https://www.npmjs.com/package/@vizuh/clicktrail) — deterministic attribution engine + browser SDK used underneath.
