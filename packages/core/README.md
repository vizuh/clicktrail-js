# @vizuh/clicktrail-core

The small, deterministic core of ClickTrail's open-source attribution handoff
layer. It keeps the conversion contract portable across stacks you own.

It parses campaign URLs, classifies referrers, merges first-touch and
last-touch attribution, builds canonical events, and creates stable event IDs
with the cross-runtime `sha256-128-v1` contract.
The core does not read the clock, access the DOM, use storage, or make network
requests. Callers provide every effect.
It uses `@noble/hashes` for stable event IDs.

## Install

```sh
npm install @vizuh/clicktrail-core
```

The package is ESM-only and requires Node.js 18 or later.

## Example

```ts
import {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
  stampVersions,
} from '@vizuh/clicktrail-core';

const result = parseAttributionUrl({
  url: 'https://example.com/?utm_source=google&utm_medium=cpc&gclid=test',
  referrer: 'https://www.google.com/',
  currentHost: 'example.com',
  now: '2026-08-24T10:00:00.000Z',
});

if (result.kind === 'touch') {
  const payload = stampVersions(
    mergeAttributionTouch(emptyAttribution(), result.touch),
  );
  console.log(payload.ft_source, payload.ft_medium);
}
```

Payment and sign-in returns: pass `ignoredReferrerHosts` (for example
`PAYMENT_REFERRER_HOSTS`, the WordPress plugin's default payment list) so a
return from `paypal.com` or `checkout.stripe.com` yields
`{ kind: 'none', reason: 'ignored_referrer' }` instead of a referral touch.
No list applies by default. GA4 needs the same hosts in its unwanted
referrals setting; this list does not change GA4.

Use [`@vizuh/clicktrail`](../clicktrail/) for the public umbrella package.
It keeps the same stable core surface and adds browser and incubating
entrypoints.

## Stored touch fields

By default the landing page is the full href and the referrer is the full
URL, matching the WordPress plugin. A landing with no campaign parameters
and no external referrer stores nothing. Each `parseAttributionUrl` option
below is opt-in:

| Option | Values | Effect |
| --- | --- | --- |
| `landingPageFormat` | `'url'` (default), `'path'`, `'path+allowlisted-query'` | `'path'` stores `/pricing`. `'path+allowlisted-query'` also keeps the query keys in `landingPageQueryAllowlist`, which defaults to `LANDING_PAGE_QUERY_ALLOWLIST` (UTMs and click IDs). |
| `referrerFormat` | `'url'` (default), `'host'` | `'host'` stores `www.google.com`. Classification still reads the full referrer. |
| `recordDirectTouch` | `false` (default), `true` | Turns a landing without signal into a placeholder touch: `Direct` (source `(direct)`, medium `(none)`) when there is no referrer, and `Unknown (before capture)` when the referrer is your own site, for example because consent came after the first page. |
| `inferSourceMedium` | `true` (default), `false` | `false` stores `source` / `medium` only as received in `utm_source` / `utm_medium`. A bare `gclid` then stores empty source and medium instead of `google` / `cpc`, and a bare referrer instead of `google` / `organic`. Inferred values still decide the channel label and code. |
| `maxFieldLength` | positive integer, default `512` | Length limit for query-parameter values: UTM fields, click IDs and browser IDs. |
| `overLengthPolicy` | `'truncate'` (default), `'drop'` | `'drop'` stores `''` for a value over `maxFieldLength` instead of cutting it. |
| `macroPolicy` | `'drop'` (default), `'keep'` | `'keep'` stores an unexpanded `{{macro}}` value as received. |
| `controlCharPolicy` | `'strip'` (default), `'drop'` | `'drop'` trims the value, then stores `''` if it still contains a control character. |
| `maxClickIdLength` | positive integer, default `maxFieldLength` | Separate length limit for click IDs, e.g. `64` with `maxFieldLength: 120`. |

`mergeAttributionTouch` writes a placeholder only into an empty payload, and
the first measured touch (UTMs, click ID or external referrer) replaces a
stored placeholder as first touch.

The value policies leave the landing page and referrer alone. By default a
query parameter whose value a policy drops still counts as received, as a
rejected macro does, so the landing still creates a touch.

## Signal rules

Hosts moving an existing first/last-touch contract onto the engine can narrow
what counts as a signal. Each option is opt-in; the defaults match the
WordPress plugin:

| Option | Values | Effect |
| --- | --- | --- |
| `signalAfterSanitize` | `false` (default), `true` | Only UTM and click-ID values that survive the value policies count. A landing whose only signals were dropped follows the no-signal path: referrer inference, the `recordDirectTouch` placeholder, or no touch. |
| `signalKeys` | `{ utm?: string[]; clickIds?: string[] }` | Only the listed UTM keys and click IDs are read; others are neither a signal nor stored. An omitted list keeps every known key; aliases such as `sc_click_id` count as their canonical key. |
| `internalReferrer` | `'related'` (default), `'same-host'` | `'same-host'` treats only the current host (ignoring `www.`) as internal, so `blog.example.com` -> `www.example.com` is a referral. |
| `caseSensitiveParams` | `false` (default), `true` | UTM and click-ID keys match exactly, so `UTM_SOURCE` is ignored. Duplicate keys still resolve to the last value. |

`mergeAttributionTouch(stored, touch, { clearLastTouchClickIds: true })`
clears `lt_<clickid>` for click IDs the new last touch lacks, so a paid
`gclid` does not stay attached to a later organic last touch. `ft_<clickid>`,
top-level click IDs and `click_id_history` are unchanged. The browser SDK
takes the same options as `createClickTrail({ mergeOptions })`.

```ts
const result = parseAttributionUrl({
  url: location.href,
  referrer: document.referrer,
  currentHost: location.host,
  now: new Date().toISOString(),
  maxFieldLength: 120,
  maxClickIdLength: 64,
  overLengthPolicy: 'drop',
  signalAfterSanitize: true,
  signalKeys: {
    utm: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'],
    clickIds: ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'],
  },
  internalReferrer: 'same-host',
  caseSensitiveParams: true,
});
if (result.kind === 'touch') {
  payload = mergeAttributionTouch(payload, result.touch, { clearLastTouchClickIds: true });
}
```

## Contract

- Same inputs produce the same outputs.
- Time, randomness, storage, consent, and transport belong to the caller.
- Payloads carry `schema_version` and `classifier_version`.
- Classifier behavior changes require a major version.

See the [architecture](../../docs/ARCHITECTURE.md) and
[event contract](../../docs/EVENT-CONTRACT.md).

## License

MIT — see [LICENSE](./LICENSE).
