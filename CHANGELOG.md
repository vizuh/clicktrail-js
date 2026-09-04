# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Report browser fetch HTTP failures through `onDropped`, preserving at-most-once delivery.
- Tolerate blocked mirror storage access and prevent same-adapter revival after blocked deletion.
- Bound server and proxy fetch delivery to 3 seconds across canonical/framework clients,
  Typebot, and Directus; abort stalled requests while preserving host failure results.
  Set Activepieces native request timeout to 3 seconds without enabling the excluded package.

## [0.1.0-rc.4] - 2026-08-25

### Added

- `@vizuh/clicktrail-astro` package: Astro integration for the ClickTrail engine,
  with consent gate, view-transition-safe page views (URL-keyed dedupe),
  optional first-party proxy route, and server-side conversion helpers
  (`ClickTrailServer.trackLead` / `trackBooking` / `trackPurchase`).
- Provenance-enabled npm publishing workflow (OIDC trusted publishing).
- Release metadata and package documentation aligned with the `@vizuh` namespace.
- `@vizuh/clicktrail-nuxt` package (Phase 2 layout: `integrations/*`): Nuxt module mirroring the Astro integration —
  SSR-safe client boot with cookie-backed consent gating (`ct_consent`),
  router-aware page views with URL-keyed dedupe, an optional first-party
  Nitro proxy route, and server-side conversion helpers.
- `n8n-nodes-clicktrail` (`integrations/n8n`): community node with lead/conversion/consent
  operations, offline conversion sending, API-key credentials, and six
  triggers explicitly deferred until stable outbound webhooks exist.
- `@vizuh/clicktrail-piece` (`integrations/activepieces`): Activepieces piece (eight actions) sharing
  the same event-builders contract; triggers deferred.
- `@vizuh/clicktrail-typebot` (`integrations/typebot`): Typebot block logic with variable mapping,
  pure event builders, and a ready-to-post upstream issue draft.
- `directus-extension-clicktrail` (`integrations/directus`): Flow operation, attribution hook,
  campaign-to-sale funnel panel, settings module, and trust-model notes.
- `@vizuh/clicktrail-qwik` (`integrations/qwik`): Qwik City middleware capture,
  resumability-friendly browser activation, consent gates, server conversions.
- `@vizuh/clicktrail-sveltekit` + `@vizuh/clicktrail-sv` (`integrations/sveltekit`,
  `integrations/sv`): SvelteKit handle hook with SSR attribution capture and
  navigation dedupe; experimental Svelte CLI community add-on.
- Python ecosystem (`python/`): `clicktrail` SDK with cross-runtime idempotent
  event IDs, `django-clicktrail`, `wagtail-clicktrail`, `clicktrail-asgi`,
  `clicktrail-jinja`, and `flask-clicktrail`.
- `@vizuh/clicktrail-formbricks`: consent-aware survey URL decoration and
  response-event normalization without raw answer or arbitrary payload capture.
- `TenantAdapter` in `@vizuh/clicktrail-server`: tenant-scoped stable events
  that preserve canonical identity while preventing caller overrides.
- Canonical event contract ratified (`docs/EVENT-CONTRACT.md`) and phased
  restructure plan ratified by council review (`docs/RESTRUCTURE-PLAN.md`).

### Changed

- Stable server-replay IDs now use the versioned `sha256-128-v1` contract in
  both JS and Python, with shared golden vectors. This changes IDs previously
  derived by the 32-bit FNV helper. Preserve already-enqueued `event_id` values
  across an upgrade and drain retry backlogs before deriving them again.
- Browser mirror retention now defaults to 90 days and accepts only whole-day
  values from 1 through 400.
- The publish workflow now tests, scans, and publishes the exact `pnpm pack`
  tarballs from a reviewed commit on `master`.

### Fixed

- Tenant adapters now consume documented identity payloads without allowing
  caller data to replace canonical identity or event fields.
- Consent withdrawal clears attribution and buffered delivery across the core
  browser lifecycle plus Astro, Nuxt, Qwik, and SvelteKit clients.
- Destination flush failures no longer interrupt `stop()` cleanup or create
  unhandled promise rejections.
- Server-side collector destinations reject plain HTTP, embedded credentials,
  loopback, private, link-local, and other non-public literal hosts.
- SvelteKit client boot owns one cancellable lifecycle and detaches consent and
  navigation listeners on replacement or unmount.
- The SvelteKit dependency graph overrides vulnerable `cookie@0.6.0` with
  `cookie@0.7.2`.

## [0.1.0-rc.3] - 2026-08-24

### Fixed

- Publish workflow validates the first release wave: core, browser, umbrella, Astro, and Nuxt.
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

[Unreleased]: https://github.com/vizuh/clicktrail-js/compare/v0.1.0-rc.4...HEAD
[0.1.0-rc.4]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0-rc.4
[0.1.0-rc.3]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0-rc.3
[0.1.0]: https://github.com/vizuh/clicktrail-js/releases/tag/v0.1.0
