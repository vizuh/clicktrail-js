# @vizuh/clicktrail-qwik

**Carry observed acquisition context through Qwik City request handlers without
an eager client script.**

The middleware parses the arrival URL in SSR code, keeps canonical attribution
context in a request-local store, and writes a first-party cookie only when the
configured consent path permits it. Server helpers build events from route
actions. The browser module remains dormant until host code activates it.

The API uses `identity` as a payload name. It is observed attribution context,
not verified person identity. The package does not prove campaign causation or
certify destination delivery.

## Install

```sh
npm install @vizuh/clicktrail-qwik
# or inside a Qwik app:
npm run qwik add @vizuh/clicktrail-qwik   # ecosystem integration path (see below)
```

## What it does

| Requirement | How |
|---|---|
| Initial attribution capture | `createClickTrailMiddleware()` parses UTMs / click IDs / external referrer on the first HTML request and merges them into the canonical payload (`ft_*` write-once, `lt_*` refreshed). |
| Request-local store | The merged attribution context lands in Qwik City\'s `sharedMap` per request; route loaders/actions read it via `identityFromSharedMap()`. |
| First-party cookie | With consent granted, the payload mirrors into the `attribution` cookie so later requests and the browser SDK keep history. Pre-consent: memory only, nothing persists. |
| No duplicate page views | Client page views dedupe on pathname+search over an injectable navigation seam; fragment-only changes are ignored. |
| Server-side conversions | `ClickTrailServer.trackLead/trackBooking/trackPurchase` send from route actions and return `{ ok, status }` without throwing into host handling. |
| Resumability | No eager bundle. `bootClickTrailClient()` runs only where/when you call it (e.g. `useVisibleTask$` post-consent). |
| Consent gating | Shared `ct_consent` cookie keeps SSR middleware, loaders, and browser code in agreement without hydration drift. |

## Setup

### 1. Server middleware (capture)

```ts
// src/routes/layout.tsx
import { createClickTrailMiddleware } from '@vizuh/clicktrail-qwik/qwik-city';

export const onRequest = createClickTrailMiddleware({
  siteId: 'my-site',
});
```

This is structural: the package never imports `@builder.io/qwik-city`; it returns a plain `(requestEvent, next) => Promise<unknown>` matching Qwik City\'s `RequestHandler` shape.

### 2. Conversions from route actions (preferred)

```ts
// src/routes/demo/lead/index.tsx (action)
import { identityFromSharedMap } from '@vizuh/clicktrail-qwik/qwik-city';
import { ClickTrailServer } from '@vizuh/clicktrail-qwik/server';

const server = new ClickTrailServer({
  endpoint: 'https://collector.example.com/v1/events',
});

export const useAction = action$(async (form, requestEvent) => {
  const identity = identityFromSharedMap(requestEvent.sharedMap);
  if (identity) {
    await server.trackLead({ identity, data: { formId: 'demo' } });
  }
  // ...your business logic
});
```

Validation matrix, canonical event names, and the never-throw `{ ok, status }` contract mirror `packages/server` exactly.

### 3. Browser page views (optional)

Qwik City has no global router-afterEach DOM event, so you inject a navigation seam:

```ts
// inside a component, after consent
import { bootClickTrailClient } from '@vizuh/clicktrail-qwik/browser';

const client = bootClickTrailClient(
  { endpoint: '/api/clicktrail', consentRequired: true },
  { navigationSeam: mySeam }, // wire useLocation()/router signals, or omit for no client views
);
```

A ready-made `createHistoryNavigationSeam()` wraps History API + popstate if you don\'t want framework-specific wiring. Same URL (pathname+search) never emits twice; real URL changes do.

## Consent

```ts
import { setConsent } from '@vizuh/clicktrail-qwik/consent';
setConsent(true); // writes ct_consent, notifies a running deferred client
```

- Middleware: cookie persistence only while `ct_consent=granted` (or `consentRequired: false`).
- Browser: with `consentRequired: true`, `start()` waits until the cookie grants or the `clicktrail:consent` event fires.
- Denial wipes attribution storage through the SDK\'s standard denial path.

Gates (`createConsentGate`, `storageAllowed`, `transmissionAllowed`) ported from `@vizuh/clicktrail-consent` are exported for hosts wiring their own CMP.

## Partytown (optional)

Heavy third-party tags can move off the main thread with [Partytown](https://partytown.qwik.dev):

```sh
npm run qwik add partytown
```

ClickTrail itself needs no worker relay because its browser footprint is
on-demand. Partytown remains an optional host decision for other marketing
tags, with no hard dependency either way.

## Ecosystem path (`npm run qwik add`)

The Qwik team routes new integrations through their ecosystem catalog ("Adding A New Integration" → issue first). We prepared the proposal text ready to file:

- [`UPSTREAM-ISSUE-DRAFT.md`](./UPSTREAM-ISSUE-DRAFT.md): copy-paste issue for qwik-modules/qwik or the ecosystem repo.

Until it is accepted upstream, install directly via npm as shown above.

## API surface

| Export | Purpose |
|---|---|
| `.` | umbrella re-export of everything below |
| `./qwik-city` | `createClickTrailMiddleware`, `captureInitialAttribution`, `identityFromSharedMap`, `SHARED_MAP_KEY` |
| `./server` | `ClickTrailServer`, `parseIdentityFromCookies` |
| `./browser` | `bootClickTrailClient`, `attachQwikNavigationTracking`, `createHistoryNavigationSeam`, `pageKeyOf` |
| `./consent` | `setConsent`, `readStoredConsent`, consent types + gates, `CONSENT_COOKIE` / `CONSENT_EVENT` |

Dependencies: `@vizuh/clicktrail-core` and `@vizuh/clicktrail-browser` only.
Peer dependencies on `@builder.io/qwik` / `@builder.io/qwik-city` are optional
metadata; the runtime never imports them.

## License

MIT

> **Distribution mirror.** Development happens in [vizuh/clicktrail-js](https://github.com/vizuh/clicktrail-js) (`integrations/qwik`). PRs and issues go there.
