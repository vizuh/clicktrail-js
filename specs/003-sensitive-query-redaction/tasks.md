# Tasks: Sensitive Query Redaction

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0 — Reproduce

- [x] T001 Write `packages/core/tests/query-redaction.test.ts` and rewrite the `defaults to the full href` test in `parse.test.ts`. Run them on the base commit: 11 + 1 tests fail.

## Phase 1 — US1/US2 (P1): redaction

- [x] T002 Export `SENSITIVE_QUERY_KEYS` (`knowledge.ts`, `index.ts`).
- [x] T003 Add `additionalSensitiveQueryKeys` (`types.ts`).
- [x] T004 Implement the matcher and `redactSensitiveQuery`; apply in `landingPageOf` and `referrerOf` (`parse.ts`).

## Phase 2 — Fixtures and docs

- [x] T005 Fixtures `sensitive-query-redacted-landing` and `sensitive-query-redacted-referrer` with `quirk_decision`.
- [x] T006 Document the rule in `docs/EVENT-CONTRACT.md`.

## Phase 3 — Gates

- [x] T007 `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`.

## Follow-ups (not in this PR)

- [ ] F001 `packages/core/README.md` note for the default and `additionalSensitiveQueryKeys`.
- [ ] F002 Decide whether the `'url'` landing format should drop the fragment.
- [ ] F003 Expose `additionalSensitiveQueryKeys` in the browser adapter config and redact values read back from existing cookies.
