# @vizuh/clicktrail-browser

Consent-aware browser effects for ClickTrail.

The browser SDK captures attribution, stores it in first-party browser
storage, injects `ct_*` fields into forms, tracks SPA page views, and sends
canonical events to destinations owned by the host. It stays inactive until
your application calls `start()` and grants consent.

## Install

```sh
npm install @vizuh/clicktrail-browser
```

The package is ESM-only and requires Node.js 18 or later.

## Example

```ts
import {
  createClickTrail,
  dataLayerDestination,
} from '@vizuh/clicktrail-browser';

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => hasMarketingConsent(),
  storage: {
    retentionDays: 90,
    cookieAttrs: { path: '/', sameSite: 'Lax', secure: true },
  },
  forms: {},
});

clickTrail.start();
```

Replace `hasMarketingConsent()` with the host application's consent source.
Do not start capture before that source grants the required purpose.

## Boundaries

- Storage and transmission are consent-gated.
- Call `clearData()` when consent is withdrawn to clear state immediately.
  `stop()` also rechecks consent and discards buffered HTTP events when the gate
  is denied. An already-started request cannot be recalled.
- The host owns the cookie policy, destination, and retention period. Mirror
  retention defaults to 90 days and must be set from 1 through 400 days.
- Cross-domain continuity needs shared signing state or explicit `sign` and
  `verify` functions.
- HTTP delivery is at-most-once; monitor the `onDropped` callback when using
  the HTTP destination. Automatic retries and durable offline queues are not
  provided, avoiding duplicate delivery without an idempotency contract.

For the supported public import surface, use
[`@vizuh/clicktrail/browser`](../clicktrail/).

## License

MIT — see [LICENSE](./LICENSE).
