# Issue draft: Proposal: optional attribution handoff for checkout conversions

Target: <https://github.com/w3bdesign/nextjs-woocommerce>

Status: posted as [1831](https://github.com/w3bdesign/nextjs-woocommerce/issues/1831). Await maintainer feedback before coding.

## Proposed title

Proposal: optional attribution handoff for checkout conversions

## Proposed body

Hi maintainers,

Would an optional example be useful for preserving first-party campaign
attribution from the Next.js storefront through the existing WooCommerce
checkout flow?

The safest first step may be documentation around a host-owned allowlisted
metadata object and a server-side WooCommerce order handoff. It should not add a
ClickTrail dependency to the default bundle, modify customer PII, or send data
to a third-party endpoint automatically. A ClickTrail adapter could be shown as
one optional implementation after the data and consent boundary is agreed.

The proposal should first confirm whether attribution belongs on the order, the
storefront analytics layer, or an export/webhook, and whether the current
GraphQL/WooCommerce extension surface supports it without changing checkout
behavior.


### Safety boundary

- The feature must be opt-in and disabled by default.
- The host application owns consent, retention, access control, and delivery.
- Accept only an explicit allowlist of UTM and ad-click fields.
- Bound field and total object sizes; treat values as untrusted and spoofable.
- Do not accept PII, cookies, visitor/session IDs, raw request objects, or
  arbitrary JSON.
- Never use attribution for authorization, pricing, workflow state, or fraud
  decisions.
- Do not send data to ClickTrail or another third party from the host project.
- Do not expose attribution to unauthorized callers.


### Questions before implementation

1. Do users need this data in the product at all?
2. Where should users see it: the primary record, a report, an export, an API,
   a webhook, or nowhere in the first version?
3. Should this be a native provider-neutral field, an extension hook, or only a
   documentation recipe?
4. What is the acceptable browser bundle or runtime dependency impact? A
   ClickTrail adapter can remain external and optional.
5. What is the acceptable code, schema, migration, API, and test impact?
6. What is the blast radius for existing records, API consumers, backups,
   exports, logs, and retention?
7. Does the project have an authorization boundary that can safely expose these
   values?

If the answer is that this does not belong in core yet, a small integration
recipe can document the boundary without changing the project's default bundle
or schema.

Thanks!
