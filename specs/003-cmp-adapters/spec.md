# Feature Specification: CMP Adapters for `@vizuh/clicktrail-consent`

**Feature Branch**: `feat/consent-cmp-adapters`

**Created**: 2026-09-29

**Status**: Draft

**Input**: GitHub issue [#39](https://github.com/vizuh/clicktrail-js/issues/39). Headless and framework sites must hand-write CMP glue today, and the ordering is easy to get wrong. In production, Cookiebot wiped attribution before the host's `OnAccept` handler re-saved it, and Calendly bookings lost `gclid` and UTMs (`bfroos/myhb-store#168`). The WordPress plugin already ships this glue (`clicutcl-consent-bridge.js`); the SDK has none.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One call connects Cookiebot (Priority: P1)

A Next.js or Nuxt site using Cookiebot calls `connectCookiebot(hub)`. ClickTrail receives a `ConsentRecord` on every decision, persists attribution only after a grant, and clears it on denial, even though Cookiebot wipes storage before its event fires.

**Why this priority**: Cookiebot is the CMP from the production incident, and it has the most hostile ordering (wipe first, then the event).

**Independent Test**: A Vitest suite with a fake `window.Cookiebot` whose "accept" handler clears storage, then dispatches `CookiebotOnConsentReady` and `CookiebotOnAccept`.

**Acceptance Scenarios**:

1. **Given** a first visit with `?gclid=X` and a pending decision, **When** the fake CMP wipes storage and dispatches accept, **Then** the hub emits `{ state: 'granted', marketing: true, source: 'cookiebot' }` once. The attribution captured afterwards contains `gclid=X`.
2. **Given** a pending decision, **When** the fake CMP dispatches decline, **Then** the hub emits `{ state: 'denied' }` and nothing is persisted.
3. **Given** `Cookiebot.hasResponse` is already true when `connectCookiebot` runs, **Then** the hub emits the current state immediately.
4. **Given** accept fires both `OnConsentReady` and `OnAccept`, **Then** subscribers see one record per distinct decision (no duplicate emissions).

---

### User Story 2 - OneTrust and Complianz parity (Priority: P2)

The same contract applies to `connectOneTrust(hub)` (`OptanonWrapper`, `OnetrustActiveGroups`) and `connectComplianz(hub)` (`cmplz_fire_categories`, `complianz.consent_data`). The category mapping is the one the WordPress bridge uses.

**Why this priority**: These are the next most common CMPs, and they are already supported in WordPress, so parity avoids divergent semantics.

**Independent Test**: Fake globals per CMP drive the same four scenarios as US1.

**Acceptance Scenarios**:

1. **Given** OneTrust groups containing the configured marketing group, **When** `OptanonWrapper` fires, **Then** the hub emits a granted record. An existing host `OptanonWrapper` is preserved and still called.
2. **Given** Complianz categories without marketing, **When** `cmplz_fire_categories` fires, **Then** the hub emits a denied record.

---

### User Story 3 - A runnable reference shows the booking handoff (Priority: P3)

A developer opens `vizuh/clicktrail-examples/cmp-booking-handoff/` and sees a landing page, a Cookiebot-style banner that wipes storage, and a booking link decorated with `utm_*` plus an opaque ClickTrail reference. Tests prove that acquisition survives the accept path and that nothing survives the reject path.

**Why this priority**: Examples are how the query-shaped audience ("Cookiebot gclid lost", "Calendly gclid") finds ClickTrail. The adapter must exist first.

**Independent Test**: `npm test` in the example directory.

**Acceptance Scenarios**:

1. **Given** the example, **When** its tests run, **Then** the accept, reject and pending cases pass, and the examples README index lists it.

---

### Edge Cases

- The CMP script loads after the adapter: the adapter waits for the global, with a bounded poll or the CMP's own ready event. It never throws.
- There is no DOM (SSR): importing the module does nothing, and `connect*` returns a no-op disposer.
- Consent changes mid-session: grant → deny emits denied, and the SDK's existing withdrawal path clears storage.
- Custom category mapping (for example, a OneTrust group ID other than `C0004`) is configurable per adapter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New entry `@vizuh/clicktrail-consent/cmp`, exporting `connectCookiebot`, `connectOneTrust` and `connectComplianz`. Each takes `(hub, options?)` and returns a disposer.
- **FR-002**: There MUST be no DOM access at import time. Each adapter accesses globals only when called (`sideEffects: false` stays true).
- **FR-003**: Each adapter MUST map CMP state to `ConsentRecord` (`state`, `analytics`, `marketing`, `advertising`, `source`, `at`) with a documented, overridable category mapping.
- **FR-004**: Adapters MUST emit only after the CMP's decision event, and MUST NOT emit anything for `pending`.
- **FR-005**: Adapters MUST deduplicate identical consecutive records.
- **FR-006**: The README MUST document the ordering contract: capture and persist on the emitted grant, reading the click ID from the current URL. Nothing is stored while pending. Denial clears state through the SDK.
- **FR-007**: The mapping semantics MUST match `click-trail-handler`'s `clicutcl-consent-bridge.js` (Cookiebot `consent.marketing` / `statistics`; OneTrust groups; Complianz `marketing` / `statistics`).
- **FR-008**: The examples repo gets `cmp-booking-handoff/` (US3), which is synthetic and test-backed like the existing examples.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All US1/US2 scenarios pass in Vitest, and a Playwright probe (Chromium, Firefox, WebKit) passes the wipe-then-accept flow.
- **SC-002**: Importing `@vizuh/clicktrail-consent/cmp` in Node, with no DOM, has no side effects (asserted by test).
- **SC-003**: A package size budget for the `cmp` entry: at most 2 KB min+gzip.

## Assumptions

- The adapters consume the CMP's decision and never render a banner or decide consent.
- Cookiebot's public API (`Cookiebot.consent`, `hasResponse`, and the `CookiebotOnConsentReady` / `OnAccept` / `OnDecline` window events) and the OneTrust/Complianz globals are stable. Re-verify them against current vendor docs in T001.
- Storage wiping is outside ClickTrail's control. The mitigation is ordering plus the classification guidance tracked in `vizuh/click-trail-handler#103`.
