# @vizuh/clicktrail-nuxt


First-party attribution and conversion tracking for [Nuxt](https://nuxt.com).

Boots the ClickTrail browser SDK (`@vizuh/clicktrail`) SSR-safely, tracks page views across vue-router navigations without duplicates, preserves first-touch/last-touch attribution on every route change, gates all tracking behind a cookie-backed consent flag shared between server and client, adds an optional first-party Nitro proxy endpoint, and ships server-side helpers for leads, bookings, and purchases.

## Install

```sh
npx nuxi module add @vizuh/clicktrail-nuxt
# or
npm install @vizuh/clicktrail-nuxt
```

Then configure the module in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@vizuh/clicktrail-nuxt'],
  clicktrail: {
    siteId: 'my-site',
    endpoint: '/api/clicktrail',
    consentRequired: true,
    trackPageViews: true,
    captureClickIds: true,
    firstPartyProxy: true,
  },
})
```

With `firstPartyProxy: true`, provide the collector upstream at runtime from a server plugin or Nitro middleware before traffic flows:

```ts
globalThis.__CLICKTRAIL_NUXT_PROXY__ = { upstream: 'https://collector.example.com/v1/events' };
```

Alternatively pass it inline at build time with `firstPartyProxy: { upstream: 'https://collector.example.com/v1/events' }`.

## What it does

| Requirement | How |
|---|---|
| Browser SDK injection | The module registers `@vizuh/clicktrail-nuxt/plugin` as a client plugin; SSR renders stay side-effect free. |
| Route-change tracking | Page views hook into `router.afterEach`; a URL-keyed dedupe (pathname + search) prevents duplicates for the same document. Query changes track; fragment changes don't. Real reloads count again. |
| First/last-touch attribution | Every URL change re-parses the landing URL and merges touches through the SDK's canonical payload store (`ft_*` preserved, `lt_*` updated) when `captureClickIds` is enabled. |
| Consent | With `consentRequired: true`, nothing starts or persists until consent lands in the shared `ct_consent` cookie. Denying later clears attribution and buffered events, then stops the running instance. |
| First-party proxy | Registers `POST /api/clicktrail` on Nitro, forwards bounded batches upstream, strips visitor IPs, allowlists forwarded headers. |
| Server-side conversions | `@vizuh/clicktrail-nuxt/server` exports `ClickTrailServer` with `trackLead`, `trackBooking`, `trackPurchase`. |

## Options

```ts
interface ClickTrailNuxtOptions {
  siteId?: string;            // copied into normalized envelopes
  workspaceId?: string;
  endpoint?: string;          // default '/api/clicktrail'; absolute https:// URLs skip route registration
  consentRequired?: boolean;  // default false
  trackPageViews?: boolean;   // default true
  captureClickIds?: boolean;  // default true
  firstPartyProxy?:
    | boolean                 // true = enable with defaults (upstream resolved at request time)
    | { pattern?: string;     // default '/api/clicktrail'
        upstream: string;     // required collector URL in object form
        forwardHeaders?: readonly string[] } // default ['user-agent', 'referer']
    ;
  debug?: boolean;            // default false
}
```

Options set directly on the module factory win over options placed under the `clicktrail` key in `nuxt.config.ts`.

The proxy behaves like the Astro integration by default: with a relative `endpoint`, the route is enabled and requires an `upstream` (a `TypeError` is thrown at build start otherwise). Set `firstPartyProxy: false` to disable the route entirely.

## Consent

Consent state lives in a first-party `ct_consent` cookie (`granted` / `denied`), so SSR and client agree without hydration drift. A `clicktrail:consent` custom event additionally notifies the running client.

```vue
<script setup>
import { useClicktrail } from '@vizuh/clicktrail-nuxt/composable';

// call from your CMP's accept callback:
function onAccept() {
  if (import.meta.client) {
    useClicktrail().setConsent(true);
  }
}
</script>
```

Granting starts a deferred instance immediately. Denying (`setConsent(false)`) clears attribution, stops a started instance, and persists the denial. Pre-consent navigations merge touches in memory only — no cookies or storage writes.

## useClicktrail()

Reads the instance the client plugin booted. Call it client-side after app init (e.g. in `onMounted`):

```ts
const ct = useClicktrail();
ct.track('lead_form_submit', { formId: 'contact' });
ct.getData();          // full canonical flat payload (ft_*/lt_* fields)
ct.getField('gclid');  // single field
ct.getSession();       // session snapshot
ct.consentGranted();   // current stored decision
```

The plugin also exposes the raw SDK instance as `globalThis.__CLICKTRAIL_NUXT__` for debugging, and provides `$clicktrail` via `nuxtApp.provide`.

## Server-side conversions

In a Nuxt server route (`server/api/**`) or Nitro middleware:

```ts
import { ClickTrailServer, parseIdentityFromCookies } from '@vizuh/clicktrail-nuxt/server';

const server = new ClickTrailServer({
  endpoint: 'https://collector.example.com/v1/events',
  siteId: 'my-site',
});

export default defineEventHandler(async (event) => {
  const identity = parseIdentityFromCookies(getHeader(event, 'cookie'));
  await server.trackPurchase({
    identity,
    data: { transactionId: 't-1234', value: 49.9, currency: 'EUR' },
  });
  return new Response(null, { status: 204 });
});
```

`trackPurchase` validates that `transactionId`, `value`, and `currency` are present and well-formed before sending. Delivery failures resolve to `{ ok: false }` instead of throwing so an analytics outage never breaks checkout.

## Nitro proxy utilities

`@vizuh/clicktrail-nuxt/nitro` exports `createEventHandler(config, fetch)` — the same validated forwarding handler the injected route uses (415/413/400/502 matrix, IP headers never forwarded, allowlisted `forwardHeaders`) — plus `parseIdentityFromCookies`.

## Related packages

- [`@vizuh/clicktrail`](https://www.npmjs.com/package/@vizuh/clicktrail) — deterministic attribution engine + browser SDK used underneath.
- [`@vizuh/clicktrail-astro`](https://www.npmjs.com/package/@vizuh/clicktrail-astro) — the same engine for Astro.

## Publishing

After the first npm publish, open an issue in the [nuxt/modules](https://github.com/nuxt/modules) repository to list this package in the official Nuxt modules directory.
