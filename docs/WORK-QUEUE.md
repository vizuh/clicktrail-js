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
| 3 | Playwright integration probe: build IIFE global bundle, load in real page, replay all golden fixtures end-to-end against window.ClickTrail | 1b exit criterion | QUEUED | Blocked by #1 |
| 4 | Storage/session adapters: cookie+localStorage mirror with expiry metadata, visitor_id/session_id generation, 30-min session roll (injected clock) | 2 | QUEUED | |
| 5 | Form injection + link decoration (cross-domain continuity, approved domains) | 2 | QUEUED | |
| 6 | WP parity fixture capture from live click-trail-handler plugin behavior | 2 gate | QUEUED | Needs WP runtime or recorded captures |
| 7 | `/conversation` subpath (Chatwoot journey attributes, captureContent=false default) | 3 | QUEUED | |
| 8 | `/agent` subpath (agent_run events, actor model, tool-call metadata) | 3 | QUEUED | |
| 9 | `/otel` subpath (traceparent correlation exporter) | 3 | QUEUED | Optional peer dep design |
| 10 | `/apointoo` destination subpath | 3 | QUEUED | |

## Done

| Item | Commit |
|---|---|
| Phase 1a: conventions + pure core + fixtures harness | 621e164 |
| #2 CI workflows + npm-facing docs | a144cf5 |
