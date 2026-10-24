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

## Channel codes

`ft_channel` / `lt_channel` hold display labels such as `Google Ads`. Set
`channelCodes: true` to also store the machine value (`paid_search`,
`organic_search`, …) as `ft_channel_code` / `lt_channel_code`. Use the code
for CRM fields and warehouse columns. It is off by default; the labels do not
change. The label-to-code table is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#channel-codes-opt-in).

Add the keys to `forms.fields` to inject them as hidden inputs; they are not
in the default form field list.

## Keeping existing visitor and session IDs

A site that already has its own first-party visitor/session IDs can keep them
when it adopts ClickTrail. `identity` requires `storage`:

```ts
const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => hasMarketingConsent(),
  storage: {},
  identity: {
    seed: () => readLegacyIds(), // { visitorId?, sessionId?, sessionStartedAt?, lastActivityAt? } | null
    sessionIdleMs: 2 * 60 * 60 * 1000, // default: 30 minutes
    sessionMaxMs: 24 * 60 * 60 * 1000, // default: no maximum
  },
});
```

- ClickTrail calls `seed` once, on the first identity read after `start()`. It
  only calls it while consent allows and when ClickTrail storage has no
  identity yet. It never replaces an existing ClickTrail identity.
- IDs must be 8-128 characters of `A-Z a-z 0-9 _ . : -`, starting with a letter
  or digit (UUIDs pass). `sessionStartedAt` and `lastActivityAt` are epoch
  milliseconds, not in the future, and need `sessionId`; `lastActivityAt`
  may not be before `sessionStartedAt`. If any field is invalid, ClickTrail
  rejects the whole seed, reports `identity_seed_rejected`, and creates fresh
  IDs.
- Pass `lastActivityAt` to keep the seeded session's idle clock: with
  `sessionIdleMs` of 2 hours, a session last active 1 hour ago survives one
  more hour without activity. Without `sessionStartedAt`, the session is
  taken to start at `lastActivityAt`. Without `lastActivityAt`, the seeded
  session counts as active when ClickTrail adopts it, so only seed a session
  that your site still treats as active.
- A seeded session that is already past `sessionIdleMs` (from
  `lastActivityAt`) or `sessionMaxMs` becomes session 2 for the same visitor.
- After consent is withdrawn, the seed is not used again for that instance.
  Delete your legacy IDs when consent is withdrawn, or the next page load
  will seed them again.

## Session activity

`sessionIdleMs` counts from the last recorded activity. By default every
delivered `track()` records activity. To decide what counts as activity
yourself, turn that off and call `touchSession()`:

```ts
const clickTrail = createClickTrail({
  // ...
  storage: {},
  identity: { sessionIdleMs: 2 * 60 * 60 * 1000, activityOnTrack: false },
});

for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, () => {
    if (document.visibilityState === 'visible') clickTrail.touchSession();
  }, { passive: true });
}

// Read without creating, rolling or writing a session:
const { sessionId } = clickTrail.getSession({ passive: true }); // '' once expired
```

- `touchSession()` is consent-gated. It starts a new session when none is
  stored or the stored one expired, then restarts the idle window. It returns
  the session snapshot.
- `getSession()` without options still creates the session when needed but
  does not count as activity.
- `getSession({ passive: true })` never writes storage and never calls
  `seed`. It returns an empty `sessionId`/`sessionNumber` when no session is
  stored or the stored one expired.

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
- A browser-ID cookie can appear twice in `document.cookie`, one per domain or
  path. Browser IDs use the first occurrence by default, the one gtag reads for
  `_ga`. Set `browserIdCookieDuplicates: 'last'` to keep the previous rule.
  Differing duplicates of `_ga`, `_ga_<property>`, `_fbp` or `_fbc` report
  `browser_id_cookie_duplicate` once per instance. `parseCookieMap(raw,
  { duplicates })` still keeps the last occurrence unless told otherwise.
- HTTP delivery is at-most-once; monitor the `onDropped` callback when using
  the HTTP destination. The fetch fallback reports non-2xx responses there;
  sendBeacon only confirms browser queue acceptance, not collector delivery.
  Automatic retries and durable offline queues are not
  provided, avoiding duplicate delivery without an idempotency contract.

For the supported public import surface, use
[`@vizuh/clicktrail/browser`](../clicktrail/).

## License

MIT — see [LICENSE](./LICENSE).
