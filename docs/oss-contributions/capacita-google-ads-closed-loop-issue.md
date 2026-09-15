# Issue review: Capacita CRM → Google Ads conversion feedback

Target: <https://github.com/misaeln-pc1/marketing-performance-capacita/issues/107>

Status checked against the public issue and comments on **2026-09-15**. The issue is
open and explicitly remains design-only. The latest owner notes say to audit and
repair the native Zoho CRM ↔ Google Ads integration first; the re-authentication flow
is currently held by Google's six-day security delay.

## Observed problem and cause

The requested closed loop is:

```text
Google Ads click → Capacita landing → Zoho CRM → validated commercial milestone → Google
```

The current evidence does not establish a missing ClickTrail adapter. It establishes a
provider and data-readiness gap:

- GCLID reaches some CRM records.
- Campaign, ad group, keyword, click date, and cost enrichment is not populated in the
  reviewed records.
- The native Zoho conversion export was observed as `Not started`.
- The Google Ads account selector in Zoho appeared empty during re-authentication.
- The issue owner has set `DESIGN_ONLY=YES`, `CRM_WRITES=0`, and
  `GOOGLE_CONVERSION_UPLOADS=0` until the data gaps close.

The issue also records a new decision: **audit native Zoho first**. A custom Data
Manager pipeline is a fallback or extension, not a reason to bypass that audit.

## Maintainer-first contribution

No runtime PR is appropriate yet. A useful contribution after the owner confirms the
native path would be one small, provider-neutral contract fixture or runbook covering
what the existing CRM integration must prove. It should not add a ClickTrail, Zoho, or
Google dependency to this repository.

Suggested contract parameters:

- allowlisted `gclid`, `gbraid`, and `wbraid` where the chosen Google path supports them;
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content` only if the
  landing/form path currently receives them;
- the real CRM record ID and configured milestone, kept server-side;
- event type, actual milestone timestamp, nullable value, and currency;
- a stable non-PII transaction ID and a destination/action idempotency key;
- the capture-time consent state, source, and policy version.

Empty identifiers must not overwrite a valid earlier touchpoint. A CRM record and its
commercial outcome remain Zoho's authority. ClickTrail could provide normalization and
capture at the trusted form boundary, but it must not decide what “matrícula” or “venta
real” means.

## Boundaries and stop conditions

- Do not send CRM PII, hashes, tokens, or real payloads to GitHub or an agent.
- Do not create CRM writes, Google uploads, account changes, or conversion actions from
  this contribution.
- Do not mark an HTTP response as Google processing proof; require destination
  diagnostics and reconciliation.
- Do not choose `PRIMARY_CONVERSION`, monetary value, reversal rules, or B2C/B2B
  mapping until the owner supplies the real Zoho fields and business decision.
- Do not add a duplicate custom pipeline while native Zoho is still unresolved.

## Acceptance before implementation

1. Native Zoho account association and auto-tagging are read-only verified.
2. The actual lead/contact/deal fields and CRM milestones are mapped.
3. Google conversion action IDs and the supported ingestion path are confirmed.
4. Consent, deduplication, reversals, expiry, and CRM↔Google reconciliation are written
   down.
5. A validate-only synthetic fixture passes without mutating CRM or Google.

**Disposition:** design record only; no ClickTrail runtime integration or host PR.
