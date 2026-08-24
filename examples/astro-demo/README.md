# Astro integration walkthrough (documentation-only)

This folder intentionally contains **no installable project**. It is a
condensed, copy-ready walkthrough of the official Astro integration,
[`@clicktrail/astro`](https://www.npmjs.com/package/@clicktrail/astro)
(source: [`packages/astro/README.md`](../../packages/astro/README.md)). A full
runnable Astro starter lives in the repo's
[`site/`](../../site/) folder.

What you learn:

- how one `astro.config.mjs` integration wires ClickTrail into every page;
- which options matter (proxy, consent, debug) and what their defaults are;
- how view-transition page views stay duplicate-free and consent-gated.

## 1. Install

```sh
npx astro add @clicktrail/astro
# or
npm install @clicktrail/astro
```

## 2. Add the integration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import clicktrail from '@clicktrail/astro';

export default defineConfig({
  integrations: [
    clicktrail({
      siteId: 'my-site',
      proxy: { upstream: 'https://collector.example.com/v1/events' },
    }),
  ],
});
```

## 3. Options (condensed from packages/astro)

| Option | Default | What it does |
|---|---|---|
| `siteId` | — | Copied into normalized envelopes. |
| `workspaceId` | — | Routing identifier in envelopes. |
| `endpoint` | `'/api/clicktrail'` | Proxy route path; absolute `https://` URLs skip route injection. |
| `proxy.upstream` | required when proxying | Collector URL that `/api/clicktrail` batches forward to (visitor IPs stripped, forwarded headers allowlisted). |
| `proxy.pattern` | `'/api/clicktrail'` | Route pattern for the injected server-rendered route. |
| `proxy.forwardHeaders` | `['user-agent', 'referer']` | Allowlist of headers passed upstream. |
| `proxy: false` | — | Disable the first-party proxy entirely. |
| `consentRequired` | `false` | With `true`, nothing starts or persists until consent is granted (see below). |
| `debug` | `false` | Verbose diagnostics during setup. |

## 4. Consent gating

```html
<script>
  // call from your CMP's accept callback:
  globalThis.__clicktrailSetConsent?.(true);
</script>
```

With `consentRequired: true`, pre-consent navigations merge touches in memory
only — no cookies or storage writes. Denying before grant leaves no persisted
state; the SDK's denial path also wipes attribution storage.

## 5. Server-side conversions

```ts
import { ClickTrailServer, parseIdentityFromCookies } from '@clicktrail/astro/server';

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

Delivery failures resolve to `{ ok: false }` instead of throwing, so an
analytics outage never breaks checkout.

## Behavior highlights

- Works in static, SSR, and hybrid output modes; page-view scripts inject on
  every page while only the proxy route is server-rendered.
- Page views listen to `astro:page-load`; a URL-keyed dedupe prevents
  duplicate events for the same document across view transitions.
- Every navigation re-parses the landing URL and merges touches through the
  canonical payload store (`ft_*` preserved, `lt_*` updated).

## Full runnable starter

See [`../../site/`](../../site/) for a complete Astro site wired with this
integration.
