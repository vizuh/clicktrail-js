# @vizuh/clicktrail-sveltekit

First-party attribution and conversion tracking for [SvelteKit](https://kit.svelte.dev).

A handle hook captures landing UTMs and click IDs into a first-party cookie, the browser SDK tracks page views across SvelteKit navigations without duplicates, consent gates all persistence, an optional first-party proxy forwards events upstream without leaking visitor IPs, and server helpers send conversions from `+page.server.ts` and form actions.

## Install

```sh
npm install @vizuh/clicktrail-sveltekit
```

## Quick start

```ts
// src/hooks.server.ts
import { clicktrail } from '@vizuh/clicktrail-sveltekit';

export const handle = clicktrail({
  siteId: 'my-site',
  proxy: { upstream: 'https://collector.example.com/v1/events' },
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import ClickTrail from '@vizuh/clicktrail-sveltekit/ClickTrail.svelte';
</script>

<ClickTrail />
```

The `ClickTrail` component boots the browser SDK with an `afterNavigate`-based navigation seam (falling back to history events outside SvelteKit).

## Options

| Option | Default | Description |
|---|---|---|
| `siteId` | — | Copied into normalized marketing trail envelopes. |
| `workspaceId` | — | Copied into normalized marketing trail envelopes. |
| `endpoint` | `/api/clicktrail` | Where the browser delivers events. Absolute `https://` URLs bypass the proxy. |
| `consentRequired` | `false` | When true, nothing is persisted until `ct_consent=granted`. An explicit `ct_consent=denied` always suppresses persistence. |
| `trackPageViews` | `true` | Track page views across client navigations. |
| `proxy` | disabled | `{ upstream, pattern?, forwardHeaders? }` or `false`. Matching requests short-circuit into the proxy handler. |

## Cookies

- `ct_attribution` — canonical flat attribution payload JSON (`Path=/`, `SameSite=Lax`, 180 days). The browser SDK's canonical `attribution` cookie name is honored on read.
- `ct_consent` — consent decision (`granted` | `denied`). Write it from your CMP integration; both the handle and the client honor it.

## Server-side conversions

```ts
// +page.server.ts
import { trackConversion } from '@vizuh/clicktrail-sveltekit/server';

export const actions = {
  demo: async ({ request }) => {
    const result = await trackConversion(request, {
      event: 'lead', // translated to the canonical lead_created
      endpoint: 'https://collector.example.com/v1/events',
      siteId: 'my-site',
    });
    // result: { ok, status } — never throws on network failure
  },
};
```

Validation contract (identical to `@vizuh/clicktrail-server`): money fields must be positive finite numbers with a non-empty ISO-4217 currency; invalid input rejects as a promise; `send` resolves `{ ok, status }` and never throws into host request handling.

## Privacy

- Visitor IPs are never forwarded by the proxy (fresh header set, allowlist only).
- Body size and batch size are bounded; malformed payloads get 4xx, upstream failures get 502.
- With `consentRequired: true`, no attribution cookie write happens before consent.

## License

MIT

> **Distribution mirror.** Development happens in [vizuh/clicktrail-js](https://github.com/vizuh/clicktrail-js) (`integrations/sveltekit`). PRs and issues go there.
