# Implementation Plan: CMP Adapters for `@vizuh/clicktrail-consent`

**Branch**: `feat/consent-cmp-adapters` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md) | **Issue**: [#39](https://github.com/vizuh/clicktrail-js/issues/39)

## Summary

Add a side-effect-free `cmp` subpath to `packages/consent` with three thin adapters that translate CMP globals and events into `ConsentHub.notify()` calls. The mapping mirrors the WordPress bridge. A separate PR in `vizuh/clicktrail-examples` adds `cmp-booking-handoff/`.

## Technical Context

**Language/Version**: TypeScript 5.6, ESM, Node ≥ 18 for tooling
**Package**: `packages/consent` (`@vizuh/clicktrail-consent`, currently `0.2.0-rc.2`); existing `createConsentHub()` in `src/listener.ts` and `ConsentRecord` in `src/types.ts`
**Testing**: Vitest (`packages/consent/tests`, jsdom environment for the new suite); the repo's existing Playwright probe harness
**Constraints**: no runtime dependencies; `sideEffects: false`; size ≤ 2 KB min+gzip for the subpath

## Design

```text
packages/consent/src/cmp/
  index.ts        export { connectCookiebot, connectOneTrust, connectComplianz }
  shared.ts       waitForGlobal(name, timeoutMs), dedupe(record), now()
  cookiebot.ts    hasResponse -> emit; window 'CookiebotOnConsentReady' | 'CookiebotOnAccept' | 'CookiebotOnDecline' -> emit
  onetrust.ts     wrap OptanonWrapper (preserve host fn); parse OnetrustActiveGroups; options.marketingGroup (default 'C0004'), analyticsGroup ('C0002')
  complianz.ts    document 'cmplz_fire_categories'; initial complianz.consent_data
packages/consent/tests/cmp.test.ts
```

- `package.json` `exports` gains `"./cmp": { "types": "./dist/cmp/index.d.ts", "default": "./dist/cmp/index.js" }`.
- Emissions are `ConsentRecord` objects: `{ state: marketing ? 'granted' : 'denied', marketing, advertising: marketing, analytics, source, at: new Date().toISOString() }`. `storageAllowed()` / `createConsentGate()` check only `state === 'granted'`, so tying `state` to marketing is deliberately conservative: analytics-only consent persists nothing, which matches the WordPress bridge. `transmissionAllowed(snapshot, purpose)` then checks the purpose flag, which is why `advertising` mirrors `marketing`.
- Disposers remove listeners and restore the wrapped `OptanonWrapper`.

## Parity reference

`vizuh/click-trail-handler` → `assets/js/clicutcl-consent-bridge.js`: `tryCookiebot`, `tryOneTrust` and `tryComplianz`. Copy the semantics, not the code, and note any intentional divergence in the README.

## Gates

- The repo's existing typecheck, test, build, size and probe workflows.
- `/code-review` before commit (consent path).
- Publishing is out of scope. It ships in the next RC wave under the existing release process.
