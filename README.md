# ClickTrail JS

[![CI](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml/badge.svg)](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml)

![ClickTrail](https://ps.w.org/click-trail-handler/assets/icon-256x256.png)

First-party, deterministic attribution and customer-journey capture engine.

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by Vizuh.
FunnelSheet is Vizuh's consulting branch. The WordPress plugin
(`click-trail-handler`) is the WordPress distribution; this repository is the
shared engine beneath it.

## Packages

| Package | Status |
|---|---|
| [`@vizuh/clicktrail`](packages/clicktrail/) | Release candidate `0.1.0-rc.2`; core, browser, storage, journey, agent, OTEL, and Apointoo subpaths |
| [`@clicktrail/astro`](packages/astro/) | Release candidate `0.1.0-rc.2`; Astro integration, consent gate, page-view tracking, first-party proxy, and server helpers |

The GitHub repository is public and the `v0.1.0-rc.2` release candidate is
prepared for GitHub release assets. npm publication remains separately gated
by trusted-publisher configuration and the provenance review in
[`docs/PROVENANCE-AUDIT.md`](docs/PROVENANCE-AUDIT.md); do not infer npm
publication from a GitHub tag.

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

## Quickstart

```bash
pnpm install
pnpm -r exec tsc -p tsconfig.json --noEmit
pnpm -r test        # vitest, replays golden fixtures
pnpm -r build       # tsc per package
pnpm probe           # ESM + global bundle + 12-fixture browser probe
pnpm audit --prod --audit-level high
```

Strict typecheck: `npx tsc -p packages/clicktrail/tsconfig.json --noEmit`.

## Use cases

- deterministic attribution parsing and first-touch/last-touch merging in Node or TypeScript apps;
- browser capture that persists observed context through cached pages and dynamic forms;
- GTM or analytics bridges through the browser `dataLayer` destination;
- replayable fixture testing for a WordPress or application integration.

Start with the [tutorials](docs/TUTORIALS.md). The package does not provide
provider account setup or certify downstream delivery. Cross-domain continuity
needs persisted signing state or explicit host-provided signing and verification.

## Why deterministic

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- Same inputs -> same output. Time, IDs, storage, consent and network are
  injected by callers, never requested by core.
- Replayable debugging: capture inputs once, reproduce attribution exactly —
  in the WP plugin, Next.js, dashboard, and CI alike.
- Golden fixtures are the executable spec; classifier upgrades get diffed
  fixture-by-fixture before any release.

## Release boundary

The core and browser surfaces are public development work. The `/conversation`
and `/agent` surfaces must remain metadata-only and require their documented
privacy gates before use with real conversations, prompts, completions, or
transcripts.

## License

MIT — see [LICENSE](LICENSE). The WordPress plugin remains GPL-2.0-or-later.
