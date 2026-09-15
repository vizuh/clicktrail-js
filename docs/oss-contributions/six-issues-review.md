# ClickTrail maintainer-first review: six upstream issues

Reviewed on **2026-09-15**. This report records the decision boundary, not upstream
adoption or provider delivery. All six host repositories reported `viewerPermission:"READ"`
for the authenticated account. ClickTrail-owned repositories are the only repositories
where a branch and draft PR are appropriate in this pass.

## Executive decision

- **Matchxelerate #22:** implement one optional, consent-aware Next.js reference example
  in ClickTrail. Do not install ClickTrail in the host application.
- **Capacita #107:** design-only. The owner is auditing native Zoho ↔ Google Ads first;
  do not add a second Data Manager pipeline or perform writes.
- **Hauddy #95:** native source and activation events already exist. Document/report the
  existing seam before proposing an adapter.
- **ROLANPRO #139:** do not duplicate active draft PR #140, which already owns the CRM,
  conversion outbox, Data Manager, adjustments, reconciliation, and Customer Match lanes.
- **Vanta Labs #184:** test and centralize the existing source/spend classification before
  adding a Google label. No Google order or spend evidence was observed in the read-only
  review.
- **CG Dynamics #335:** do not duplicate active PR #336, which already owns exact
  Ads↔GA4 mapping and provider-reporting states. ClickTrail is not a replacement for
  either provider.

The detailed records are [Capacita](./capacita-google-ads-closed-loop-issue.md),
[matchXelerate](./matchxelerate-consent-utm-gclid-issue.md),
[Hauddy](./hauddy-campaign-attribution-issue.md),
[ROLANPRO](./rolan-google-ads-crm-issue.md),
[Vanta Labs](./vanta-google-ads-attribution-issue.md), and
[CG Dynamics](./cg-dynamics-ga4-ads-issue.md).

## Shared contract

ClickTrail is useful only at the acquisition-context boundary:

```text
landing query → consented first-party context → server form handoff → host outbox
```

The smallest provider-neutral envelope is:

- `gclid`, `gbraid`, `wbraid`;
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`;
- landing route without the query string;
- capture time and consent snapshot/policy version;
- a host-owned stable lead/order/event ID when the server accepts the record.

Every value is untrusted, allowlisted, and bounded. Empty values do not overwrite a
valid first touch. PII, credentials, cookies, raw requests, arbitrary JSON, and provider
responses are outside this envelope.

The host remains the authority for:

- consent, retention, deletion, and access control;
- CRM/database records and joins;
- lifecycle milestones, revenue, refunds, and reversals;
- destination credentials, account/action IDs, and request contracts;
- outbox atomicity, retries, idempotency, reconciliation, and diagnostics.

A conversion value is nullable. If present, its currency and actual event timestamp are
required. A local payload builder or successful queue insert is not proof that Google,
Zoho, HubSpot, Meta, GA4, or another provider accepted or reported the event.

## No-package fallback

A host does not need a ClickTrail dependency. Its existing middleware or cookie utility
can implement the same allowlist, bounds, affirmative-consent gate, first-touch rule, and
server attachment. If the host cannot establish those controls, the safe fallback is not
to persist the identifier and not to add a package.

## Validation performed

- The corrected Next.js example uses synthetic IDs and `.test` addresses only.
- `npm test` in `nextjs-google-ads-offline-conversions`: **9 passed**.
- `npm run typecheck` in the same example: **passed** after adding the missing React and
  Node type dependencies and JSX compiler setting.
- `git diff --check`: passed for the example and this documentation worktree.
- No command in this contribution calls Google, Zoho, CRM, GTM, Data Manager, Ads, or a
  live host application.

These checks prove local structure and policy behaviour only. They do not prove consent
legality, provider matching, campaign attribution, CRM storage, or production readiness.

## Lessons for maintainers

1. **Validate the host seam first.** A native source field or reporting path is often
   better than a new dependency.
2. **Do not confuse capture with commercial truth.** Click IDs identify acquisition
   context; only the host can define a qualified lead, activation, closed sale, refund,
   or reversal.
3. **Keep provider roles separate.** Google Ads spend/clicks, GA4 behaviour, CRM stages,
   and ClickTrail deterministic handoff data must not be silently merged or treated as
   interchangeable.
4. **Fail closed.** Unknown or denied consent, missing configuration, missing spend, and
   unavailable provider data must remain explicit states rather than guessed defaults.
5. **Prefer a small fixture or guide.** A synthetic lifecycle test and no-package recipe
   are safer first contributions than a core schema, migration, provider client, or live
   upload.
6. **Do not duplicate active work.** Existing upstream PRs #140 and #336 remain the
   owners of their respective host implementations.

## Remaining risks

- Provider-specific Google Ads and Data Manager field contracts still require an owner-led
  account and validate-only check.
- Cookie retention, consent categories, and lawful basis are host policy decisions.
- Browser click IDs can be absent, malformed, expired, or spoofed.
- The example does not implement a CRM, outbox, queue worker, or provider client.
- Upstream issue and PR states can change after this review date.
