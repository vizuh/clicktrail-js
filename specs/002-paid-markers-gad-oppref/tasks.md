# Tasks: Paid markers `gad_source`, `gad_campaignid` and `oppref`

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0 - Reproduce

- [x] T001 Add `packages/core/tests/paid-markers.test.ts`, `packages/browser/tests/browser-paid-markers.test.ts` and fixtures `google-ads-gad-source-no-gclid.json`, `chatgpt-ads-oppref.json`. Run them on the base commit: they fail (core 9, browser 2, fixtures 2).

## Phase 1 - Core

- [x] T002 `knowledge.ts`: marker keys, platform map, `ChatGPT Ads` label, `resolveChannelLabel` input, landing-page allowlist.
- [x] T003 `parse.ts` + `types.ts`: collect markers, classify, expose `ParsedTouch.paidMarkers`, gate with `signalKeys.clickIds`.
- [x] T004 `merge.ts`: mirrors, `emptyAttribution`, first-touch guard, `clearLastTouchClickIds`; never audit/select.
- [x] T005 `conventions/stable.ts`: `ATTR_AD_MARKER_*`, `SCHEMA_VERSION` and `CLASSIFIER_VERSION` 1.3.0. Update the `stampVersions` assertion.

## Phase 2 - Adapters

- [x] T006 `payload-store.ts`: canonical allowlist gains the nine keys (covers `filterServerAttributionPayload`).

## Phase 3 - Docs and checks

- [x] T007 `docs/EVENT-CONTRACT.md`: paid-marker paragraph.
- [x] T008 `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace` all green.

## Follow-ups (not in this change)

- [ ] `docs/ARCHITECTURE.md` still says `1.2.0` and its channel-label table lacks Google Ads via `gad_source` and ChatGPT Ads.
- [ ] Decide whether cross-domain continuation tokens and form injection should carry the markers.
- [ ] Python `clicktrail.landing` click-ID table (five keys, no channel rules) is a subset; extend only if Python gains classification.
