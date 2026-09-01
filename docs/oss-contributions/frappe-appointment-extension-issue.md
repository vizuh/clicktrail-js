# Issue draft: Expose a validated booking-context extension point before Event creation

Target: <https://github.com/rtCamp/frappe-appointment>

Status: posted as [345](https://github.com/rtCamp/frappe-appointment/issues/345). Await maintainer feedback before coding.

## Proposed title

Expose a validated booking-context extension point before Event creation

## Proposed body

Hi maintainers,

# 🚀 Feature Request

## **Description**

Frappe Appointment creates bookings inside the Frappe data model. An installed
Frappe app may need to attach small, consent-gated booking context before the
final Event is created.

## **Motivation**

A provider-neutral extension point would let an external app preserve source
context without adding hard-coded UTM columns, an analytics SDK, or arbitrary
field injection to the core DocType.

## **Mockups or References**

A documented resolver/custom-app event could receive the booking request and
created Event identifier. An external app could own its custom fields or related
DocType and observe approved appointment status changes.

## **Acceptance Criteria:**

- [ ] Maintainers identify the supported extension point and site/user ownership boundary.
- [ ] The extension contract validates an allowlisted, bounded context object.
- [ ] Existing booking behavior is unchanged when no extension is installed.
- [ ] The documentation states that values are untrusted and no vendor dependency is required.

## **Additional Context**

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
