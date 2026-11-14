# Feature Specification: Paid markers `gad_source`, `gad_campaignid` and `oppref`

**Feature Branch**: `Atroci/ct-js-06-gad-oppref`

**Created**: 2026-11-14

**Status**: Implemented in the PR that closes #82.

**Input**: GitHub issue [#82](https://github.com/vizuh/clicktrail-js/issues/82), parity with `vizuh/click-trail-handler#231`. `packages/core` knows neither `gad_source`, `gad_campaignid` nor `oppref`. A Google Ads landing whose `gclid` was stripped (Safari link tracking protection, Brave, blockers) carries `gad_source=1` and classifies as Google Organic. A ChatGPT Ads landing carries `oppref` and classifies as a ChatGPT referral.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A gclid-less Google Ads landing is paid (Priority: P1)

A visitor lands from `google.com` on `/?gad_source=1&gad_campaignid=999` with no `gclid`.

**Acceptance Scenarios**:

1. **Given** that landing, **When** it is parsed, **Then** the touch is `paid_search`, labelled `Google Ads`, with source `google` and medium `cpc`.
2. **Given** the merged payload, **Then** `gad_source`, `ft_gad_source`, `lt_gad_source` (and the `gad_campaignid` trio) hold the received values.
3. **Given** the merged payload, **Then** `attribution_selected_click_id` is `''` and `click_id_history` is `[]`: a marker is never the selected click ID.

### User Story 2 - A ChatGPT Ads landing is paid (Priority: P1)

**Acceptance Scenarios**:

1. **Given** `/?oppref=abc123` from `chatgpt.com`, **Then** the touch is `paid_other`, labelled `ChatGPT Ads`, source `chatgpt`, medium `cpc`.
2. **Then** `oppref`, `ft_oppref`, `lt_oppref` hold `abc123`, and no click ID is selected.

### User Story 3 - A real click ID is unaffected (Priority: P2)

1. **Given** `?gclid=G1&gad_source=1`, **Then** `G1` is the selected click ID and the only `click_id_history` entry.
2. **Given** `?fbclid=F1&gad_source=1`, **Then** the touch is Google Ads: a marker is advertising-only and outranks an uncertain click ID, never a certain one.

### Edge Cases

- `gad_campaignid` alone forms a touch and is stored, but has no platform rule: it does not classify as paid.
- `signalKeys.clickIds` gates markers like click IDs (fail closed: an unlisted marker is neither a signal nor stored).
- `clearLastTouchClickIds` also blanks a stale `lt_<marker>`.
- `landingPageFormat: 'path+allowlisted-query'` keeps the three keys in its default allowlist.

## Requirements *(mandatory)*

- **FR-001**: `PAID_MARKER_KEYS` (`gad_source`, `gad_campaignid`, `oppref`) and `PAID_MARKER_PLATFORMS` live in `packages/core/src/core/knowledge.ts`. `ATTR_AD_MARKER_*` constants follow the OTel naming rule in `conventions/stable.ts`.
- **FR-002**: `parseAttributionUrl` reads markers with the click-ID value policy and `signalKeys.clickIds` gate, and returns them on `ParsedTouch.paidMarkers`, separate from `clickIds`.
- **FR-003**: Channel rules: `gclid | gbraid | wbraid | gad_source` give Google Ads paid; `oppref` gives ChatGPT Ads paid (`CHANNEL_LABELS.CHATGPT_ADS`). Markers are never the selected click ID.
- **FR-004**: `mergeAttributionTouch` mirrors markers to `ft_`/`lt_`/top-level like click IDs, but never writes them to `click_id_history` or the selection keys. `emptyAttribution()` carries the nine keys as `''`.
- **FR-005**: The browser storage allowlist (`CANONICAL_PAYLOAD_KEYS`) includes the nine keys, so `filterServerAttributionPayload` and store round-trips keep them. The `marketing_trail` `click_ids` map is unchanged.
- **FR-006**: `CLASSIFIER_VERSION` and `SCHEMA_VERSION` go to `1.3.0` (classification change; additive keys). New fixtures record a `quirk_decision`.

## Success Criteria

- **SC-001**: Parsing a landing with `gad_source=1` from `google.com` yields the Google Ads channel and stores `gad_source`; `oppref` yields ChatGPT Ads; neither becomes the selected click ID.
- **SC-002**: All existing fixtures replay unchanged.

## Assumptions

- Python (`python/clicktrail`) has a five-key click-ID parse table and no channel rules. It mirrors only the capture: `parse_landing` also returns the three markers (separate `PAID_MARKER_KEYS`, `None` when absent). Django's middleware filters by an explicit field set, so it drops them; Flask and ASGI pass the dict through.
- Cross-domain link decoration, form injection and the server conversion data allow-lists are not widened: carrying these markers to other domains or third parties is a separate decision.
