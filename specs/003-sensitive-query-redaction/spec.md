# Feature Specification: Sensitive Query Redaction in Stored Landing Page and Referrer

**Feature Branch**: `Atroci/ct-js-07-query-redaction`

**Created**: 2026-11-14

**Status**: Implemented in this PR.

**Input**: GitHub issue [#83](https://github.com/vizuh/clicktrail-js/issues/83). Parity with the WordPress plugin ([click-trail-handler#232](https://github.com/vizuh/click-trail-handler/issues/232), spec 017). The default `landingPageFormat: 'url'` and `referrerFormat: 'url'` store the full URL including query parameters such as `email`, `token`, `phone`, `password`, `code` and `session`. They persist in the attribution cookie/mirror and leave in every event.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Landing page is stored without personal query parameters (Priority: P1)

A visitor lands on `https://example.com/lp?email=a%40b.com&utm_source=google&utm_medium=cpc&token=abc&gclid=G1&phone=%2B5511999999999`. The stored `ft_/lt_landing_page` keeps the UTMs and `gclid` and carries no email, token or phone.

**Why this priority**: it is a privacy fix. Consent gates storage, but a URL parameter the visitor never agreed to share should not be written at all.

**Independent Test**: `packages/core/tests/query-redaction.test.ts` and the `sensitive-query-redacted-landing` fixture.

**Acceptance Scenarios**:

1. **Given** the URL above and default options, **Then** `landingPage` is `https://example.com/lp?utm_source=google&utm_medium=cpc&gclid=G1`.
2. **Given** `landingPageFormat: 'path+allowlisted-query'` and a caller allowlist that names `email`, **Then** `email` is still removed.
3. **Given** `landingPageFormat: 'path'`, **Then** nothing changes (no query is stored).

### User Story 2 - Referrer is stored without personal query parameters (Priority: P1)

An external referrer such as `https://news.example.org/a?q=1&access_token=zzz` is stored as `https://news.example.org/a?q=1`. `referrerFormat: 'host'` is unchanged.

**Acceptance Scenarios**:

1. **Given** a referrer whose only parameters are sensitive, **Then** the stored referrer has no `?`.
2. **Given** a referrer with no sensitive key, **Then** the stored value is byte-identical to the input.
3. **Given** a Google referrer with `sid=S1`, **Then** the channel is still `Google Organic` (classification reads the raw referrer).

### User Story 3 - Hosts extend the list (Priority: P2)

A host passes `additionalSensitiveQueryKeys: ['member']`. `member` and `club_member` are removed on top of the default list.

## Requirements *(mandatory)*

- **FR-001**: Export `SENSITIVE_QUERY_KEYS` with exactly the plugin list: `email`, `e-mail`, `mail`, `phone`, `tel`, `mobile`, `token`, `access_token`, `id_token`, `auth`, `password`, `pass`, `pwd`, `secret`, `key`, `api_key`, `apikey`, `code`, `otp`, `session`, `sessionid`, `sid`, `signature`, `sig`, `nonce`, `ssn`, `card`, `iban`.
- **FR-002**: A query key is sensitive when its lowercased, percent-decoded name equals a list entry or ends with `_<entry>`. `monkey` and `emailer` do not match; `user_email` and `MY_TOKEN` do.
- **FR-003**: Redaction applies before storage in every format that keeps a query string: `landingPageFormat` `'url'` and `'path+allowlisted-query'`, and `referrerFormat` `'url'`. It also covers the unmeasured placeholder touches.
- **FR-004**: `utm_*` keys, click IDs (`CLICK_ID_KEYS`), aliases (`PARAM_ALIASES`) and browser-ID keys (`BROWSER_ID_PARAMS`) are never removed, even when they match the suffix rule (`utm_code`, `li_fat_id`) or are named in `additionalSensitiveQueryKeys`.
- **FR-005**: Kept parameters keep their order and raw encoding (`+`, `%40`). The `?` is dropped when none remain. The fragment is not touched.
- **FR-006**: `additionalSensitiveQueryKeys` extends the list with the same matching rule. It cannot shorten the default list.
- **FR-007**: Signal detection (UTMs, click IDs, referrer classification) reads the raw URL and referrer and does not change.

## Decision record (quirk / semver)

- **Default behavior change, not opt-in.** This revises ruling #12 ("landing page stores the FULL href"). The query still rides along, minus sensitive keys. Reason: privacy fix with plugin parity.
- **Semver**: observable change of a default, so it ships in the next minor of `@vizuh/clicktrail-core` (pre-1.0 RC line). The new option and exported constant are additive. `CLASSIFIER_VERSION` and `SCHEMA_VERSION` are unchanged: channel logic and payload keys do not move.
- **Fixtures**: two new fixtures carry the decision in `quirk_decision`. One existing unit test (`defaults to the full href...`) encoded the defect and is rewritten. No existing fixture changed.
- **Sensitive wins over the path allowlist**: a caller who allowlists `email` still gets it removed. Fail closed.

## Out of scope (recorded as follow-ups)

- The `'url'` landing format keeps the fragment, as before. A fragment can carry tokens (`#access_token=`). Dropping it is a separate default change.
- `packages/core/README.md` documents the stored-fields options and needs a short note; it is outside this unit's file list.
- Browser and integration packages do not expose `additionalSensitiveQueryKeys` yet.
- Redacting `landing_url` / `referrer` values that older versions already wrote to an existing cookie (the plugin does this in `Attribution_Provider::sanitize`). Core has no cookie reader; the browser adapter would own it.
