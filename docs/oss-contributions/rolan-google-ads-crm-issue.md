# Issue review: ROLANPRO Google Ads and CRM integration

Target: <https://github.com/zufarataev-code/Rolan-PRO-CRM/issues/139>

Status checked on **2026-09-15**: open. Draft PR [#140](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/140)
is already active and contains the requested CRM-side implementation work. Its latest
checks reported success, but the PR remains draft and its live provider/account proof is
not complete.

## Why this is not a new integration target

The issue is a large CRM feature, not a missing browser helper. PR #140 already owns the
schema, lead attribution, conversion events, outbox, Data Manager worker, adjustments,
Customer Match, cost import, reconciliation, settings, and diagnostics lanes. Opening a
second PR would create competing business logic.

## Useful ClickTrail boundary

If the ROLANPRO maintainers want a ClickTrail contribution, keep it at the existing
website lead/form handoff:

- capture `gclid`, `gbraid`, `wbraid`, approved UTM fields, landing page, supported
  session attributes, and capture-time consent;
- append a touchpoint only after the server accepts the lead;
- attach it to the server-owned lead/contact ID;
- preserve a valid earlier click ID when a later request is empty;
- hand off a stable, non-PII external key to ROLANPRO's transaction/outbox service.

ROLANPRO must remain the authority for PostgreSQL business data, deal stages, revenue,
refunds, Customer Match eligibility, credentials, and destination receipts. The canonical
sale boundary is `CLOSED_WON` after the signed agreement and required deposit; Project
creation is not another sale. A qualified-lead event must remain disabled until a real
qualified stage is configured.

Suggested outbox contract parameters:

- event type and actual occurred timestamp;
- nullable Decimal value and currency;
- immutable business event ID;
- destination account + action + transaction ID uniqueness;
- consent state that preserves `UNKNOWN`/`DENIED`;
- request ID, retry state, and reconciliation status.

## Review gates

- Business mutation and outbox row are one database transaction.
- Repeated stage updates and concurrent workers cannot duplicate the event.
- Unknown money is `NULL`, not zero or an estimate.
- Validate-only requests are not described as live delivery.
- Provider diagnostics and CRM reconciliation remain separate from ClickTrail capture
  evidence.

**Disposition:** do not duplicate PR #140. Offer an optional capture adapter or review
fixture only after the ROLANPRO maintainers identify a concrete seam that the active PR
does not already cover.
