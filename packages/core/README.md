# @vizuh/clicktrail-core

The dependency-free, deterministic core of ClickTrail.

It parses campaign URLs, classifies referrers, merges first-touch and
last-touch attribution, builds canonical events, and creates stable event IDs
with the cross-runtime `sha256-128-v1` contract.
The core does not read the clock, access the DOM, use storage, or make network
requests. Callers provide every effect.

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

Use [`@vizuh/clicktrail`](../clicktrail/) for the public umbrella package.
It keeps the same stable core surface and adds browser and incubating
entrypoints.

## Contract

- Same inputs produce the same outputs.
- Time, randomness, storage, consent, and transport belong to the caller.
- Payloads carry `schema_version` and `classifier_version`.
- Classifier behavior changes require a major version.

See the [architecture](../../docs/ARCHITECTURE.md) and
[event contract](../../docs/EVENT-CONTRACT.md).

## License

MIT — see [LICENSE](./LICENSE).
