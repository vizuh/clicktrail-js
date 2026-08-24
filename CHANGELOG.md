# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@clicktrail/astro` package: Astro integration for the ClickTrail engine,
  with consent gate, view-transition-safe page views (URL-keyed dedupe),
  optional first-party proxy route, and server-side conversion helpers
  (`ClickTrailServer.trackLead` / `trackBooking` / `trackPurchase`).
- Provenance-enabled npm publishing workflow (OIDC trusted publishing).
- Socket supply-chain badge for the published `@vizuh/clicktrail` package.
- `@clicktrail/nuxt` package: Nuxt module mirroring the Astro integration —
  SSR-safe client boot with cookie-backed consent gating (`ct_consent`),
  router-aware page views with URL-keyed dedupe, an optional first-party
  Nitro proxy route, and server-side conversion helpers.
- `n8n-nodes-clicktrail`: community node with lead/conversion/consent
  operations, offline conversion sending, API-key credentials, and six
  triggers explicitly deferred until stable outbound webhooks exist.
- `@clicktrail/piece-clicktrail`: Activepieces piece (eight actions) sharing
  the same event-builders contract; triggers deferred.
- `@clicktrail/typebot-block`: Typebot block logic with variable mapping,
  pure event builders, and a ready-to-post upstream issue draft.
- `directus-extension-clicktrail`: Flow operation, attribution hook,
  campaign-to-sale funnel panel, settings module, and trust-model notes.
- Canonical event contract ratified (`docs/EVENT-CONTRACT.md`) and phased
  restructure plan ratified by council review (`docs/RESTRUCTURE-PLAN.md`).

## [0.1.0-rc.3] - 2026-08-24

### Fixed

- Publish workflow now validates and publishes only `@vizuh/clicktrail`.
- Standalone product site dependencies move to Astro 7.2.6 with sharp 0.35.3
  override for the current OSV findings.

## [0.1.0] - 2026-08-24

### Added

- First npm release of
  [`@vizuh/clicktrail`](https://www.npmjs.com/package/@vizuh/clicktrail):
  deterministic first-party attribution engine capturing the trail from ad
  click to conversion.
- Stable entry points: root (`@vizuh/clicktrail`) and `/browser`.
- Incubating entry points: `/conversation`, `/agent`, `/otel`, `/apointoo`.
  These may change between minor versions.
- Golden-fixture parity harness against the WordPress plugin
  ([`click-trail-handler`](https://wordpress.org/plugins/click-trail-handler/)):
  fixtures captured from live plugin behavior are replayed as the executable
  spec.

### License

- MIT. The WordPress plugin remains GPL-2.0-or-later; MIT embeds cleanly
  into GPL.

[Unreleased]: https://github.com/vizuh/clicktrail-js/compare/v0.1.0...HEAD
[0.1.0-rc.3]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0-rc.3
[0.1.0]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0
