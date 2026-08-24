# ClickTrail JS

[![CI](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml/badge.svg)](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml) <!-- badge placeholder: activates once pushed to GitHub -->

First-party, deterministic attribution and customer-journey capture engine.

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by Vizuh.
FunnelSheet is Vizuh's consulting branch. The WordPress plugin
(`click-trail-handler`) is the WordPress distribution; this repository is the
shared engine beneath it.

## Packages

| Package | Status |
|---|---|
| [`@vizuh/clicktrail`](packages/clicktrail/) | Phase 1a — stable attribution conventions + pure core engine |

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
pnpm -r test        # vitest, replays golden fixtures
pnpm -r build       # tsc per package
```

Strict typecheck: `npx tsc -p packages/clicktrail/tsconfig.json --noEmit`.

## Why deterministic

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- Same inputs -> same output. Time, IDs, storage, consent and network are
  injected by callers, never requested by core.
- Replayable debugging: capture inputs once, reproduce attribution exactly —
  in the WP plugin, Next.js, dashboard, and CI alike.
- Golden fixtures are the executable spec; classifier upgrades get diffed
  fixture-by-fixture before any release.

## License

MIT — see [LICENSE](LICENSE). The WordPress plugin remains GPL-2.0-or-later.
