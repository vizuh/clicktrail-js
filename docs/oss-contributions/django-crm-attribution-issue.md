# Issue draft: Proposal: optional provider-neutral attribution for lead submissions

Target: <https://github.com/DjangoCRM/django-crm>

Status: posted as [509](https://github.com/DjangoCRM/django-crm/issues/509). Await maintainer feedback before coding.

## Proposed title

Proposal: optional provider-neutral attribution for lead submissions

## Proposed body

Hi maintainers,

DjangoCRM already models lead sources and contact/request flows. Would the
maintainers consider an optional, provider-neutral attribution extension for
lead or contact-form creation?

The smallest useful shape could be a nullable, validated attribution object
with allowlisted `utm_*` fields and approved ad click IDs. The host could expose
it in the admin/API only where the existing record permissions already permit
access. ClickTrail would be an optional browser or Django adapter, not a
required dependency.

A first contribution could be a design discussion or a small adapter. A native
model field and migration should wait until the maintainers confirm the desired
record, UI, and API surface.


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
