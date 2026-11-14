# Implementation Plan: Sensitive Query Redaction

**Branch**: `Atroci/ct-js-07-query-redaction` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md) | **Issue**: [#83](https://github.com/vizuh/clicktrail-js/issues/83)

## Summary

Remove sensitive query keys from the stored landing page and referrer in two places: inside `parseAttributionUrl`, and again in `mergeAttributionTouch`, the one function every touch passes through before storage. The second pass covers touches built outside the parser (the opt-in cross-domain continuation touch from `buildReferralTouch`), which carry the landing URL and the origin's `lt_landing_page` as the referrer unredacted. The browser adapter needs no change.

## Technical Context

**Language/Version**: TypeScript, ESM
**Package**: `packages/core` (`src/core/{knowledge,types,parse,index}.ts`)
**Testing**: Vitest (`packages/core/tests`), golden fixtures replayed by `packages/clicktrail/tests/fixtures-replay.test.ts`
**Constraints**: no new dependencies; defaults, `CLASSIFIER_VERSION` and `SCHEMA_VERSION` for channel logic unchanged

## Design

- `knowledge.ts`: `SENSITIVE_QUERY_KEYS` constant (plugin list, same order).
- `types.ts`: `additionalSensitiveQueryKeys?: readonly string[]` on `ParseAttributionInput`.
- `parse.ts`: private `sensitiveMatcher` (decode, lowercase, protect `utm_*` / click IDs / aliases / browser IDs, exact or `_<word>` suffix) and `redactSensitiveQuery` (string level: split the query on `&`, drop matches, rejoin the raw parts, keep the fragment). `landingPageOf` applies it for `'url'` and filters the allowlisted-query format through the matcher. `referrerOf` applies it for `'url'`.
- `merge.ts`: `mergeAttributionTouch` runs the exported `redactSensitiveQuery` (default list) on `touch.landingPage` and `touch.referrer` before writing `ft_`/`lt_`. It is a no-op on parsed touches. Extra keys added through `additionalSensitiveQueryKeys` apply in the parser only; the merge pass uses the default list (see F003).
- `additionalSensitiveQueryKeys` entries that are not strings, or are empty, are ignored (an empty word would match every key ending in `_`).
- String-level redaction, not `URLSearchParams`, so kept parameters keep their order and raw encoding and an unchanged URL is returned as is. The allowlisted-query format keeps its existing `URLSearchParams` serialization.
- Percent-decoding the key defeats `%65mail`. A malformed escape is matched raw.

## Gates

- `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`.
- New tests fail on the base commit and pass with the change (see PR body).
- Publishing is out of scope.
