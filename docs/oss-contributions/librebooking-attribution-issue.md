# Issue draft: Proposal: optional provider-neutral attribution for reservations

Target: <https://github.com/LibreBooking/librebooking>

Status: [original #1663 was closed because it bypassed the required template](https://github.com/LibreBooking/librebooking/issues/1663); reposted as [#1664](https://github.com/LibreBooking/librebooking/issues/1664) with the required feature sections.

## Proposed title

Proposal: optional provider-neutral attribution for reservations

## Proposed body

Hi maintainers,

LibreBooking has a reservation lifecycle, custom attributes, and plugin hooks.
Would maintainers want an optional way to preserve campaign attribution from a
booking form through the reservation record?

A plugin or documented extension could read a small allowlisted attribution
object and associate it with a reservation without adding a vendor dependency to
core. If a post-reservation hook is the supported path, an adapter could later
map a completed reservation to a server-side conversion event with a stable
idempotency key.

This proposal does not ask LibreBooking to collect analytics or send data to a
third party. It asks first whether reservation-level attribution is useful and
which existing extension point is safe.


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
