# ClickTrail JS — Build Work Queue

Supervisor protocol: at any moment AT LEAST ONE child agent should be working.
On completion: review diff -> run `pnpm test` + `npx tsc --noEmit` in
packages/clicktrail -> commit -> mark DONE -> spawn next item.

Rules for every task:
- Core (`src/core`, `src/conventions`) stays deterministic: no Date.now(),
  Math.random(), window/document/storage/network/console access.
- All work lands with vitest tests green + strict typecheck clean.
- Do NOT commit; leave changes uncommitted for supervisor review unless told otherwise.
- Follow docs/ARCHITECTURE.md (council verdict) and OTel-style conventions.

## Queue

| # | Item | Phase | Status | Notes |
|---|---|---|---|---|
| 1 | `/browser` subpath: payload serialization, fetch+sendBeacon batched transport, dataLayer destination, `window.ClickTrail` legacy global adapter, consent-gate interface wiring | 1b | IN PROGRESS (worker: build-browser-sdk) | Done by build-browser-sdk: `src/browser/{serialize,transport,global-adapter,create-clicktrail,index}.ts` + 5 test files (39 tests green, typecheck clean). All effects injected (send fn, dataLayer array, clock, consent gate); dataLayer created only in start(); no window access outside page code. getSession() reads visitor_id/session_id/session_number payload keys — real generation deferred to #4. Status left for supervisor to flip. |
| 2 | CI workflow `.github/workflows/ci.yml` (install, typecheck, test, build) + npm README polish + `.npmrc` publish config notes | 1b | IN PROGRESS (worker: build-ci-docs) | DONE by worker, awaiting supervisor review: ci.yml added (Node 20+22 matrix: pnpm cache, frozen-lockfile install, `pnpm -r exec tsc -p tsconfig.json --noEmit`, `pnpm -r test`, `pnpm -r build`); root README got CI badge placeholder + Quickstart + Why-deterministic (3 bullets); new packages/clicktrail/README.md (stable vs /incubating OTel-style example, WP plugin link, MIT); publish.yml added as fully commented-out OIDC trusted-publishing DRAFT with ARCHITECTURE preconditions (scope ownership + copyright provenance + versioning gates) in its header. No `.npmrc` created — publish config lives as documented comments in publish.yml (access public + provenance); add real `.npmrc` only when publishing is enabled. Both workflows parse-checked as valid YAML; no secrets; all referenced scripts exist. Tests + strict typecheck green after changes. Uncommitted. |
| 3 | Playwright integration probe: build IIFE global bundle, load in real page, replay all golden fixtures end-to-end against window.ClickTrail | 1b exit criterion | DONE by worker, awaiting supervisor review | esbuild IIFE bundle via new `src/global-entry.ts` + `build:global` script -> `dist/clicktrail.global.js` exposing `window.ClickTrail` namespace ({createClickTrail, createLegacyGlobal, dataLayerDestination, httpDestination, buildEventPayload, parseAttributionUrl}); tsc ESM build untouched. Root-level probe: `probe/run-probe.mjs` + root `pnpm probe` script; Playwright ^1.62 chromium-only devDep at repo ROOT. Serves each fixture as a minimal HTML page on 127.0.0.1 (ephemeral port), embeds fixture input verbatim, injected clock from `input.now`, dataLayer-only assertions, navigates with fixture query string. 6/6 PASS in real Chromium, byte-identical output across repeat runs, exit 1 verified on tampered fixture. track-before-start ordering contract asserted per fixture. NOT wired into CI. Tests 39 green, typecheck clean. Uncommitted. |
| 4 | Storage/session adapters: cookie+localStorage mirror with expiry metadata, visitor_id/session_id generation, 30-min session roll (injected clock) | 2 | DONE by worker (storage-sessions), awaiting supervisor review | New `src/browser/{storage,payload-store,identity}.ts` + 4 test files; `create-clicktrail.ts` wired (`config.storage`: retentionDays, cookieAttrs, adapter/randomBytes/nowMs overrides) and `browser/index.ts` re-exported. 125 tests green, strict typecheck clean, build passes. LEGACY_KEY_ALIASES = first_*/last_* -> ft_*/lt_* per DATA-MODEL.md:123 (canonical wins when non-empty). Mirror envelope {v:1, expires_at, data}; legacy entries without metadata discarded on read. Consent denial clears payload + all 5 documented keys across both adapters incl. legacy ct_attribution. rollSession pure + table-driven (boundary rolls at elapsed==timeout; clock skew does not roll). All randomness/clock/document access behind injected seams. Uncommitted. |
| 5 | Form injection + link decoration (cross-domain continuity, approved domains) | 2 | DONE (7c5bc9b) | ct_ prefix verified vs plugin source; default field subset is documented deviation; extended fields via config |
| 6 | WP parity fixture capture from live click-trail-handler plugin behavior | 2 gate | LIVE VALIDATION DONE (3e28135) | 14 MATCH / 8 RULED DIFF / 0 errors; 2 findings ruled -> follow-up item #12 |
| 7 | `/conversation` subpath (Chatwoot journey attributes, captureContent=false default) | 3 | DONE (f8fd72f) | retry succeeded after silent no-op attempt; privacy guard fail-closed at construction time |
| 8 | `/agent` subpath (agent_run events, actor model, tool-call metadata) | 3 | DONE (202814b) | exact-key allowlist guard; ai.trace_id linking without OTel dep |
| 9 | `/otel` subpath (traceparent correlation exporter) | 3 | DONE (de0e0a1) | zero OTel imports; structural tracer interface; deterministic derivation |
| 10 | `/apointoo` destination subpath | 3 | DONE (fb7c403) | outcome-only lane; auth law documented; minimization via canonical allowlist |
| 12 | Implement runtime-finding rulings: core parses browser-ID URL params; adapter collects consent-gated cookie IDs; merge mirrors click IDs into ft_/lt_ fields; update fixtures; rerun `pnpm parity` expecting only ruled diffs | 2 freeze prep | DONE (fa3127b) | 16 MATCH/9 RULED DIFF/0 new; sticky-top-level-cid ruled as deviation D3 (Hugo gate) |
| 11 | Core parity fixes per WP-PARITY-DRAFT.md SUPERVISOR RULINGS | 2 prep | DONE (396a1ad) | 13 drafts flipped to CONTRACT; 5 standing deviations pinned (incl. bare-click-id inference -> Hugo gate before WP swap); versions 1.1.0 |
| 13 | `@vizuh/clicktrail-astro` Astro integration package (integrations/astro): SDK injection via page entrypoint, view-transition page views with URL-keyed dedupe, per-navigation touch merge, consent-deferred start, optional first-party proxy route (`injectRoute`, bounded + IP-stripping), server helpers (`ClickTrailServer.trackLead/trackBooking/trackPurchase`), zero astro imports (structural types, /otel precedent) | 4 release-prep | DONE by worker (astro-integration), awaiting supervisor review | 35 tests green (factory/page-views/client-boot/proxy/server-helpers), strict typecheck clean, build emits dist for all 5 subpath exports, `npm pack --dry-run` = 31 files dist+README+LICENSE+pkg only. RELEASE BLOCKERS: the permanent `@vizuh/*` namespace is selected and applied; Hugo must verify npm scope ownership, complete the provenance attestations, and configure trusted publishing; FIRST-PUBLICATION-CHECKLIST governance gates (B1-B3 attestations) still open and gate ALL publishes; @vizuh/clicktrail itself not yet published (dependency must ship first or together). Uncommitted. |

## Done

| Item | Commit |
|---|---|
| Phase 1a: conventions + pure core + fixtures harness | 621e164 |
| #2 CI workflows + npm-facing docs | a144cf5 |
| #1 /browser subpath (serialize/transport/dataLayer/global adapter) | 1a03720 |
| #3 Playwright integration probe (IIFE + in-browser replay, 6/6) | 60459f0 |
| #6-prep parity analysis + supervisor rulings | e48e331 |
| #11 core parity implementation (78 tests green) | 396a1ad |
| #4 storage + identity/session adapters (125 tests green) | 01b5a12 |
| #5 form injection + cross-domain tokens (189 tests green) | 7c5bc9b |
| #6 runtime parity harness (real plugin JS executed, 23 fixtures) | 3e28135 |
| #12 ruling implementation (16 MATCH / 9 RULED DIFF / 0 unexplained) | fa3127b |
| #7 /conversation subpath (journey store + Chatwoot builder, privacy fail-closed) | f8fd72f |
| #8 /agent subpath (recorder + metadata-only guard) | 202814b |
| #9 /otel subpath (W3C traceparent, zero OTel deps) | de0e0a1 |
| #10 /apointoo destination (+ hydration API, mirror-key storage fix) | fb7c403 |

## QUEUE COMPLETE

All items done. Remaining work is DECISION-gated, not buildable:
- Hugo gate: deviation D2 (bare-click-id inference labels) + D3 (newest-wins top-level click IDs) before WP runtime swap
- Hugo gate: npm publish preconditions (@vizuh scope ownership, copyright provenance)
- Deferred: wiring probe+parity into CI; WP plugin swap execution; live Chatwoot/Apointoo integration pilots
