[Português (Brasil)](README.md) | [English](README.en.md)

# ClickTrail JS

[![CI](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml/badge.svg)](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml)

![ClickTrail](https://ps.w.org/click-trail-handler/assets/icon-256x256.png)

**Carry observed acquisition context from arrival to the conversion boundary.**

ClickTrail JS parses UTMs, referrers, and ad click IDs, applies deterministic
first-touch and last-touch rules, and returns a flat canonical payload. Its
browser adapter can persist that payload in host-controlled first-party storage
and attach it to configured forms and events behind the host's consent gate.

The engine preserves observed acquisition context. It does not prove which
click caused a sale, resolve a person's identity across devices, configure ad
platforms, or certify downstream delivery.

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by
Vizuh. The WordPress plugin (`click-trail-handler`) is the WordPress
distribution; this repository contains the shared JavaScript engine.

> **Release boundary:** use the [npm registry](https://www.npmjs.com/package/@vizuh/clicktrail)
> for the published package version and [GitHub Releases](https://github.com/vizuh/clicktrail-js/releases)
> for source tags. Stable and incubating entry points are listed below.

## Why ClickTrail

Use ClickTrail when a later form, order, or application event needs the
acquisition context observed on arrival.

- **Deterministic and replayable.** The core engine is pure: same inputs ->
  same output. Time, IDs, storage, consent, and network are injected by
  callers, never requested. Golden fixtures from the WordPress contract are
  the executable spec; replay them in CI to verify parity.
- **Host-controlled first-party storage.** The browser adapter stores observed
  context under the host's domain. Payloads may include platform-issued click
  IDs from the arrival URL; ClickTrail does not turn them into cross-device
  identity.
- **Consent-gated by design.** Nothing starts or persists until the host's
  consent gate allows it. Consent state is injected by the caller; denied or
  withdrawn consent clears stored payloads.
- **Flat canonical payload.** Every event is a flat record of `ft_*`
  (first-touch) and `lt_*` (last-touch) fields, stamped with `schema_version`
  and `classifier_version`. Store it in your own database, map it into a
  CRM, or forward through GTM's `dataLayer`.

## Quick start

Install the engine:

```bash
pnpm add @vizuh/clicktrail
# or: npm install @vizuh/clicktrail
```

Parse an ad-click landing URL deterministically in Node, a worker, or a test:

```ts
import {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
  stampVersions,
} from '@vizuh/clicktrail';

const result = parseAttributionUrl({
  url: 'https://example.com/?utm_source=google&utm_medium=cpc&gclid=test',
  referrer: 'https://www.google.com/',
  currentHost: 'example.com',
  now: '2026-08-24T10:00:00.000Z', // caller owns the clock
});

if (result.kind === 'touch') {
  const payload = stampVersions(
    mergeAttributionTouch(emptyAttribution(), result.touch),
  );
  console.log(payload.ft_source, payload.ft_medium);
}
```

The result carries UTMs, ad click IDs (`gclid`, `fbclid`, `ttclid`, ...),
referrer classification, and channel labels as flat `ft_*` / `lt_*` fields.
See [docs/TUTORIALS.md](docs/TUTORIALS.md) for browser capture, form
injection, cross-domain continuity, and `dataLayer` bridging.

### Browser capture

On the page, the browser adapter persists observed context and pushes
canonical events to a site-owned `dataLayer`:

```ts
import {
  createClickTrail,
  dataLayerDestination,
} from '@vizuh/clicktrail/browser';

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => hasMarketingConsent(), // replace with your real consent source
  storage: {
    cookieAttrs: { path: '/', sameSite: 'Lax', secure: true },
  },
  forms: {},
});

clickTrail.start();
```

Test the integration with consent granted, denied, and withdrawn; with a
cached page; and with a form added after load.

### Entry points (`@vizuh/clicktrail`)

| Import | Status | Use |
|---|---|---|
| `@vizuh/clicktrail` | Stable | Pure parser, merge engine, constants, types |
| `@vizuh/clicktrail/browser` | Stable adapter | Browser lifecycle, storage, forms, dataLayer, HTTP |
| `@vizuh/clicktrail/conversation` | Incubating | Journey and conversation metadata |
| `@vizuh/clicktrail/agent` | Incubating | Metadata-only agent-run and tool summaries |
| `@vizuh/clicktrail/otel` | Incubating | Trace-context helpers and destination |
| `@vizuh/clicktrail/apointoo` | Incubating | Apointoo outcome delivery |

Incubating entry points can change between minor versions. Keep them behind a
host adapter until their contracts are stabilized.

## Packages

| Package | Status |
|---|---|
| [`@vizuh/clicktrail`](packages/clicktrail/) | Stable subpaths `.` and `/browser`; incubating `/conversation`, `/agent`, `/otel`, `/apointoo` |
| [`@vizuh/clicktrail-astro`](integrations/astro/) | Astro integration: consent gate, view-transition page views, first-party proxy, server helpers |
| [`@vizuh/clicktrail-nuxt`](integrations/nuxt/) | Nuxt module: consent gate, router-aware page views, first-party Nitro proxy, server helpers |
| [`n8n-nodes-clicktrail`](integrations/n8n/) | n8n community node: lead/conversion/consent operations, offline conversions; triggers deferred pending outbound webhooks |
| [`@vizuh/clicktrail-piece`](integrations/activepieces/) | Activepieces piece: eight actions incl. sale/refund/consent; triggers deferred |
| [`@vizuh/clicktrail-typebot`](integrations/typebot/) | Typebot block logic + upstream issue draft: variable mapping, never-throws send guarantee |
| [`directus-extension-clicktrail`](integrations/directus/) | Directus extension: Flow operation, attribution hook, funnel panel, settings module |
| [`@vizuh/clicktrail-core`](packages/core/) | Deterministic engine, canonical event contract, idempotent event ids |
| [`@vizuh/clicktrail-browser`](packages/browser/) | Browser SDK (consent-aware capture, storage, forms, destinations) |
| [`@vizuh/clicktrail-consent`](packages/consent/) | Consent state types, gates, listener hub |
| [`@vizuh/clicktrail-server`](packages/server/) | Server ingestion client + conversion builders |
| [`@vizuh/clicktrail-qwik`](integrations/qwik/) | Qwik/Qwik City integration: resumability-friendly middleware, zero eager client JS |
| [`@vizuh/clicktrail-sveltekit`](integrations/sveltekit/) | SvelteKit handle + component: SSR attribution capture, nav dedupe, server conversions |
| [`@vizuh/clicktrail-sv`](integrations/sv/) | Svelte CLI community add-on (experimental): one-command setup |
| Python packages (`python/`) | `clicktrail` SDK + Django / Wagtail / ASGI / Jinja / Flask adapters; canonical events, JS-bit-exact idempotency |
| [Examples](./examples) | Runnable integration examples |
| [Site](./site) | Project site |

## How it compares

ClickTrail is an attribution engine you host, not a hosted analytics
service. A rough comparison against the two common alternatives:

| | ClickTrail | GA4 (client-side) | Server-side tagging |
|---|---|---|---|
| Data ownership | First-party storage on your domain; payloads land in systems you control | Collected by Google; processed under Google's terms | Your tag server holds data in transit, but most setups still forward to vendors |
| Determinism & testability | Pure functions with golden-fixture replay in CI; classifier changes are major semver | Vendor processing pipeline; not replayable | Tag configuration is testable, but attribution logic stays vendor-side |
| Consent handling | Consent gate injected by the host; nothing starts or persists without it; denial clears payloads | Consent Mode signals; collection behavior governed by Google | Handled per tag/vendor; you configure each downstream consent pass-through |
| Ad-blocker resilience | No third-party endpoints; optional first-party proxy route keeps collection same-origin | Blocked by common filter lists | Fewer blocks if you proxy first-party, but vendor destinations remain exposed |
| Cost | Open source (MIT); self-hosted; no per-event vendor pricing | Free tier; GA360 pricing at scale | Tag-server infrastructure plus per-vendor forwarding costs |

This table describes architectural differences, not a benchmark. Evaluate
against your own requirements before choosing.

## Architecture in one line

```
conventions (meaning)  ->  core engine (pure functions)  ->  adapters (browser / server / destinations)
```

Design rules (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

1. The core engine is **deterministic**: same inputs -> same output. Time,
   IDs, storage, consent and network are injected by callers, never requested.
2. Golden fixtures are the executable spec. Where fixtures disagree with docs,
   fixtures win and docs get fixed.
3. Every payload carries `schema_version` and `classifier_version`.
4. Classifier behavior changes are major semver, by definition.

Development quickstart for contributors:

```bash
pnpm install
pnpm typecheck
pnpm -r test        # vitest, replays golden fixtures
pnpm -r build       # tsc per package
pnpm probe          # ESM + global bundle + fixture browser probe
```

## Use cases

- deterministic attribution parsing and first-touch/last-touch merging in Node or TypeScript apps;
- browser capture that persists observed context through cached pages and dynamic forms;
- Astro sites that need view-transition-safe page views behind a consent gate;
- GTM or analytics bridges through the browser `dataLayer` destination;
- replayable fixture testing for a WordPress or application integration.

Start with the [tutorials](docs/TUTORIALS.md). The packages do not provide
provider account setup or certify downstream delivery. Cross-domain continuity
needs persisted signing state or explicit host-provided signing and verification.

## Release boundary

The core and browser surfaces are public development work. The `/conversation`
and `/agent` surfaces must remain metadata-only and require their documented
privacy gates before use with real conversations, prompts, completions, or
transcripts.

## Documentation

- [Message and claim rules](https://github.com/vizuh/click-trail-handler/blob/main/docs/guides/COMPETITIVE-POSITIONING-AND-ACQUISITION-ROADMAP-2026-08-22.md#4-cross-repository-message-constitution): shared category, vocabulary, evidence, and translation contract
- [Architecture](docs/ARCHITECTURE.md): design rules, frozen formats, WP-parity rulings
- [Tutorials](docs/TUTORIALS.md): deterministic replay, browser capture, forms, `dataLayer`
- [`@vizuh/clicktrail` package README](packages/clicktrail/README.md): entry points, usage, conventions
- [`@vizuh/clicktrail-astro` package README](integrations/astro/README.md): Astro integration setup and options
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

MIT; see [LICENSE](LICENSE). The WordPress plugin remains GPL-2.0-or-later;
MIT embeds cleanly into GPL.
