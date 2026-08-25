# Issue draft: Allow optional booking-request metadata to survive appointment confirmation

Target: <https://github.com/adamspd/django-appointment>

Status: posted as [484](https://github.com/adamspd/django-appointment/issues/484). Await maintainer feedback before coding.

## Proposed title

Allow optional booking-request metadata to survive appointment confirmation

## Proposed body

Hi maintainers,

## Feature Description

Django Appointment separates an appointment request from the confirmed
appointment. A booking request may carry consent-gated campaign context that is
lost unless the existing request relationship or a dedicated field preserves
it.

## The Ideal Solution

Would maintainers consider an optional validated booking-context field or
resolver on `AppointmentRequest`, accessible from the related confirmed
`Appointment` without forcing a second copy? A nullable JSON field with a strict
schema or a configurable sanitized resolver could be considered. No ClickTrail
dependency should be added.

## The Current Solution

- Keep the context outside the package and provide a host-side adapter.
- Use a documentation recipe if the existing request relationship is enough.
- Add a native field only if users need admin/API visibility.

## Additional Context

### Safety and compatibility boundary

- Opt-in and disabled by default.
- The host owns consent, retention, access control, and delivery.
- Use a strict allowlist of campaign fields and bounded string values.
- Treat browser-supplied values as untrusted and spoofable.
- Do not accept PII, cookies, visitor/session IDs, raw request objects, or
  arbitrary nested JSON by default.
- Do not use attribution for authorization, identity, pricing, eligibility, or
  fraud decisions.
- Do not expose it to unauthorized callers.
- Do not add a required ClickTrail, Google, Meta, or other analytics dependency.

### Questions before implementation

1. Do users actually need this context in the product?
2. Where should users see it: the durable record, admin detail, report, export,
   API, or webhook?
3. Is a native field needed, or is a plugin, hook, or documentation recipe the
   better boundary?
4. What are the migration, API, test, backup, export, log, and retention costs?
5. What authorization boundary controls read and write access?
6. Which lifecycle event is authoritative, and should failed optional delivery
   affect the business transaction? It should not by default.

## Are you willing to help with the implementation?

- [x] Yes, I will contribute to the implementation of this feature.
- [ ] No, I can't assist with the implementation, but I can provide feedback and guidance.

## Priority

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low
