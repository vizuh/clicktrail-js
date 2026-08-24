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
[0.1.0]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0
