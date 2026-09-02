# Issue draft: Proposal: optional consent-aware attribution for rendered form submissions

Target: <https://github.com/Draggable/formeo>

Status: posted as [485](https://github.com/Draggable/formeo/issues/485). Await maintainer feedback before coding.

## Proposed title

Proposal: optional consent-aware attribution for rendered form submissions

## Proposed body

Hi maintainers,

Formeo renders forms that can be submitted through an application's existing
handler. Would you consider a documentation-first example for preserving
first-party campaign attribution through that submit path?

Formeo would not depend on ClickTrail or another analytics provider. The
example could show an explicit, allowlisted metadata object containing
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`,
`gbraid`, `wbraid`, `fbclid`, `msclkid`, and `ttclid`.

The example should cover dynamically rendered forms, consent denied, normal
submission without attribution, and bounded validation by the host. A ClickTrail
adapter would be one optional implementation, not part of Formeo's default
bundle.


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
