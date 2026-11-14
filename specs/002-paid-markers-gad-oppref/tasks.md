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

- [x] T006b `python/clicktrail/landing.py`: `PAID_MARKER_KEYS` captured by `parse_landing`; test in `test_landing.py`.

## Phase 3 - Docs and checks

- [x] T007 `docs/EVENT-CONTRACT.md`: paid-marker paragraph.
- [x] T008 `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace` all green.

## Follow-ups (not in this change)

- [x] `docs/ARCHITECTURE.md` version (1.3.0) and channel table (Google Ads via `gad_source`, ChatGPT Ads) updated in fix round 2.
- [ ] Decide whether cross-domain continuation tokens and form injection should carry the markers.
- [ ] Python has capture only (no channel rules); classification parity needs a Python classifier first.
- [x] `DATALAYER_VERSION` bumped `2.0.0` to `3.0.0` in fix round 2: dataLayer pushes, HTTP events and Apointoo outcome records spread the canonical payload, so they carry the nine marker keys (ARCHITECTURE rule: a change to which keys reach the dataLayer bumps its major).
- [ ] No fixture pins a `gad_campaignid`-only landing from google.com (now `unknown` channel, empty source/medium, label `Google Organic`, same as a `utm_campaign`-only landing on base).
