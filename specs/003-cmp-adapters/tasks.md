# Tasks: CMP Adapters for `@vizuh/clicktrail-consent`

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0 — Verify

- [ ] T001 Re-check vendor docs for the Cookiebot, OneTrust and Complianz globals and events, and record any drift in plan.md. Read `gates.ts` to confirm which purpose flags `transmissionAllowed()` and `storageAllowed()` evaluate.

## Phase 1 — US1 (P1): Cookiebot

- [ ] T002 Scaffold `src/cmp/{index,shared,cookiebot}.ts` and the `./cmp` export. Add an SSR no-side-effect test (SC-002).
- [ ] T003 [P] `tests/cmp.test.ts` for Cookiebot, covering wipe-then-accept, decline, `hasResponse` at connect time, and double-event dedupe. Write the tests first; they must fail before T004.
- [ ] T004 Implement `connectCookiebot` until T003 passes.

## Phase 2 — US2 (P2): OneTrust and Complianz

- [ ] T005 Write the tests, then implement `connectOneTrust` (host `OptanonWrapper` preserved, group options).
- [ ] T006 Write the tests, then implement `connectComplianz`.

## Phase 3 — Docs and proof

- [ ] T007 Document the ordering contract (FR-006) and the parity notes (FR-007) in the `packages/consent/README.md` section.
- [ ] T008 Playwright probe: fake a CMP page that wipes storage and then dispatches, across Chromium, Firefox and WebKit (SC-001). Add a size-budget check (SC-003).

## Phase 4 — US3 (P3): example (separate PR in `vizuh/clicktrail-examples`)

- [ ] T009 Add `cmp-booking-handoff/`: a landing page, a stub banner that wipes, the adapter plus `@vizuh/clicktrail-browser` capture, and a booking link decorated with `utm_*` plus an opaque ref. Tests cover accept, reject and pending. Add a README index entry. Reuse the `gclid-gbraid-wbraid-lead/` patterns. Note: that example (commit `79481e7`) sits only on `origin/docs/nextjs-attribution-boundaries`, whose PR #1 merged before it was pushed. Land it on examples `main` first, or port the helpers.

## Dependencies

T001 → T002 → T003 → T004 → (T005, T006) → T007 → T008 → T009.
