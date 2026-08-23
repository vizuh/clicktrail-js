# ClickTrail JS

First-party, deterministic attribution and customer-journey capture engine.

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by Funnelsheet.
The WordPress plugin (`click-trail-handler`) is the WordPress distribution; this
repository is the shared engine beneath it.

## Packages

| Package | Status |
|---|---|
| [`@funnelsheet/clicktrail`](packages/clicktrail/) | Phase 1a — stable attribution conventions + pure core engine |

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

## Development

```bash
pnpm install
pnpm test
```

## License

MIT — see [LICENSE](LICENSE). The WordPress plugin remains GPL-2.0-or-later.
