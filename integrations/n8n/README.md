# n8n-nodes-clicktrail

ClickTrail community node for [n8n](https://n8n.io). Send first-party
attribution events — leads, conversions, consent — from n8n workflows to
your ClickTrail collector.

## Install

Community node, unscoped package name `n8n-nodes-clicktrail`. Install from
n8n: **Settings → Community Nodes → Install** → enter the package name.

## Credentials

`clickTrailApi`:

- **Collector Endpoint** (`baseUrl`, required) — must be `https://`.
- **API Key** (optional) — sent as the `X-ClickTrail-Key` header when set.
- **Request Timeout** — default 10000 ms.

## Operations

| Resource | Operation | Event | Required inputs |
|---|---|---|---|
| Lead | Create or Identify Lead | `lead_created` | — |
| Lead | Attach Attribution | `lead_created` | attribution JSON or flat ft_/lt_ collection |
| Lead | Update Stage | `lead_updated` | `stage` |
| Lead | Mark Qualified | `lead_qualified` | `leadId` |
| Lead | Merge Visitor | `lead_merged` | `anonymousVisitorId`, `knownContactId` |
| Conversion | Record Appointment | `booking_created` | — |
| Conversion | Record Completed Appointment | `booking_completed` | — |
| Conversion | Record Sale | `sale` | `transactionId`, `value`, `currency` |
| Conversion | Record Recurring Revenue | `sale` | `subscriptionId`, `value`, `currency` |
| Conversion | Record Refund | `refund` | `originalTransactionId` (value is negative-safe) |
| Conversion | Send Offline Conversion | `sale` | `conversionName` + `clickId` or `trailId` |
| Consent | Record Consent | `consent_updated` | `state` (granted\|denied\|withdrawn) |
| Consent | Record Withdrawal | `consent_updated` | — |
| Consent | Update Consent Policy | `consent_updated` | `source`, `policyVersion` |
| Consent | Anonymize Visitor | `visitor_anonymized` | `visitorId` |

Every operation POSTs `{ events: [event] }` to the collector and returns
`{ ok, status }` per item. Failures surface as `NodeApiError` with the
operation name included — never silent success.

**Anonymize Visitor** emits a deletion REQUEST event only. Actual erasure
depends on collector support.

## Triggers

Deferred by design — see [`src/TRIGGERS-DEFERRED.md`](src/TRIGGERS-DEFERRED.md).
Six planned triggers are gated on stable outbound ClickTrail webhooks; none
are implemented in 0.1.0.
