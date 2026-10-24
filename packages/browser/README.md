# @vizuh/clicktrail-browser

Consent-aware browser effects for ClickTrail's open-source attribution handoff
layer.

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
- Unavailable localStorage does not stop capture or cookie persistence. Blocked
  deletion suppresses stale reads for the current adapter; browser policy may
  prevent physical deletion, so hosts must still persist and enforce withdrawal.
- Cross-domain continuity needs shared signing state or explicit `sign` and
  `verify` functions.
- Set `ga4MeasurementId: 'G-XXXXXXX'` (or an array) when the domain may carry
  more than one GA4 property. `ga_session_id` then comes only from that
  property's `_ga_<ID>` cookie, so server-side events can join its session.
  Without it, the first `_ga_*` cookie wins and `ga_session_property_unpinned`
  is reported when several exist.
- The dataLayer destination never pushes Google tag field names flat
  (`session_id`, `client_id`, `user_id`, `session_number`,
  `engagement_time_msec`, `timestamp_micros`, `page_location`,
  `page_referrer`); it pushes `ct_<name>` and sends the canonical `page_view`
  as `event: 'ct_page_view'` (`datalayer_version` 2.0.0). Configure with
  `reservedFieldPrefix` and `pageViewEvent`.
- HTTP delivery is at-most-once; monitor the `onDropped` callback when using
  the HTTP destination. The fetch fallback reports non-2xx responses there;
  sendBeacon only confirms browser queue acceptance, not collector delivery.
  Automatic retries and durable offline queues are not
  provided, avoiding duplicate delivery without an idempotency contract.

For the supported public import surface, use
[`@vizuh/clicktrail/browser`](../clicktrail/).

## License

MIT — see [LICENSE](./LICENSE).
