# DjangoCRM maintainer questions and resolution record

Source: [DjangoCRM issue #509](https://github.com/DjangoCRM/django-crm/issues/509)
and [PR #510](https://github.com/DjangoCRM/django-crm/pull/510). Status checked
against GitHub on **2026-09-01**.

The issue was intentionally framed as a question rather than a request to add
ClickTrail to DjangoCRM. The maintainer replied that click-attribution tracking
is planned but not a priority because Google Analytics is available, and asked
for a native Django Admin implementation without third-party applications.

## Questions and current answers

| Question | Maintainer-directed answer |
|---|---|
| Is the use case wanted? | Yes as a planned, lower-priority DjangoCRM capability; it is not being accepted as a ClickTrail dependency. |
| Which record and surface? | Submitted `Request` records and Django Admin. The PR adds source, medium, and campaign filters. |
| Native field, extension, or recipe? | Native DjangoCRM change. PR #510 uses nullable allowlisted fields and a migration. |
| What is the browser/runtime impact? | No ClickTrail or other third-party application. Query values pass through hidden form fields; cookies and sessions are excluded. |
| What is the data boundary? | Allowlisted `utm_*`, `gclid`, and `fbclid`; unknown or overlong values are ignored. No PII, raw request data, or arbitrary JSON. |
| What is the authorization boundary? | Existing Django Admin permissions. No new public exposure is proposed. |
| Which lifecycle event is authoritative? | Contact-form submission into a Request. The PR does not propagate values automatically to Lead or Contact records. |
| What happens if optional delivery fails? | Nothing is delivered by DjangoCRM. Google Analytics remains unaffected and no external delivery is added. |

## Current upstream state

PR #510 is open and says its focused checks passed, including Django system
checks, migration checks, and 13 request-receiving tests. Its description also
reports one existing SQLite lock error in the full test suite and four skipped
tests. That is upstream review state, not a ClickTrail CI result.

ClickTrail's role remains limited to a possible future adapter. The native PR
should be evaluated on DjangoCRM's own conventions and permissions. If it is
merged, update this record with the merge commit and remove any implication
that ClickTrail is required.
