# Implementation Plan: Paid markers `gad_source`, `gad_campaignid` and `oppref`

**Branch**: `Atroci/ct-js-06-gad-oppref` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md) | **Issue**: [#82](https://github.com/vizuh/clicktrail-js/issues/82)

## Summary

Add a third key family next to click IDs and browser IDs. Markers are parsed as touch signals, classify the channel, and are stored like click IDs, but they live in their own bag (`ParsedTouch.paidMarkers`) so click-ID history and selection never see them.

## Technical Context

**Language/Version**: TypeScript 5.6, ESM. **Testing**: Vitest in `packages/core`, `packages/browser`, `packages/clicktrail` (golden fixtures).
**Constraint** (`docs/ARCHITECTURE.md`): core stays deterministic; a classifier change bumps `CLASSIFIER_VERSION`; no fixture change without a recorded `quirk_decision`.

## Design

- `knowledge.ts`: `PAID_MARKER_KEYS`, `PAID_MARKER_PLATFORMS` (`gad_source` -> google/`paid_search`, `oppref` -> chatgpt/`paid_other`), `CHANNEL_LABELS.CHATGPT_ADS`, `resolveChannelLabel({ paidMarkers })`, markers in `LANDING_PAGE_QUERY_ALLOWLIST`. `CHANNEL_LABELS_VERSION` 3.
- `parse.ts`: collect markers after click IDs. A marker counts as a signal. Platform choice: a certain click ID wins; otherwise a marker platform; otherwise the existing uncertain-click-ID/UTM path.
- `merge.ts`: `MIRRORED_KEYS` (click IDs + markers) drive the ft_/lt_ mirrors, `clearLastTouchClickIds` and the first-touch guard. Top-level write for markers is separate from the click-ID audit loop.
- `payload-store.ts`: canonical allowlist gains the nine keys; `filterServerAttributionPayload` derives from it.
- Not changed: link decoration, form injection, server conversion data allow-lists, `click_ids` envelope. Python (`python/clicktrail/clicktrail/landing.py`) mirrors capture only.

## Versioning

`SCHEMA_VERSION` and `CLASSIFIER_VERSION` `1.2.0` -> `1.3.0` (1.x is the unpublished development line, same convention as 1.1.0 -> 1.2.0).

## Gates

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`.
