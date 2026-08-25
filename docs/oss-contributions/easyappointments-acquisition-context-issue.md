# Issue draft: Preserve consent-aware acquisition context on appointment records and webhooks

Target: <https://github.com/alextselegidis/easyappointments>

Status: posted as [1944](https://github.com/alextselegidis/easyappointments/issues/1944). Await maintainer feedback before coding.

## Proposed title

Preserve consent-aware acquisition context on appointment records and webhooks

## Proposed body

Hi maintainers,

Easy!Appointments has a durable appointment and customer workflow. Would
maintainers consider an optional, provider-neutral acquisition-context structure
that can survive appointment creation and remain available to authorized admin
and integration surfaces?

The smallest useful core contract would be validated storage plus an adapter hook.
Possible surfaces are appointment details, customer context, exports, API
responses, and existing appointment-created/updated webhooks if those hooks are
already part of the supported architecture. This proposal does not ask the
project to add a new webhook subsystem.

A ClickTrail adapter could capture first/last-touch values and map only the
approved fields. `landing_url` and `referrer` should not be default fields; if
maintainers want them, they need explicit normalization, retention, and privacy
rules.

### Safety and compatibility boundary

- Opt-in and disabled by default.
- The host owns consent, retention, access control, and delivery.
- Use a strict allowlist of campaign fields and bounded string values.
- Treat browser-supplied values as untrusted, spoofable observed context.
- Do not accept PII, cookies, visitor/session IDs, raw request objects, or
  arbitrary nested JSON by default.
- Do not use provenance for authorization, identity, pricing, eligibility, or
  fraud decisions.
- Do not expose it to unauthorized callers.
- Do not add a required ClickTrail, Google, Meta, or other analytics dependency.


### Questions before implementation

1. Do users actually need this context in the product?
2. Where should users see it: the durable record, admin detail, report, export,
   API, or webhook?
3. Is a native field needed, or is a plugin, hook, or documentation recipe the
   better boundary?
4. What is the acceptable bundle/runtime impact? An optional external adapter
   should add no default dependency.
5. What are the migration, API, test, backup, export, log, and retention costs?
6. What existing authorization boundary controls read and write access?
7. Which lifecycle event is authoritative, and should failed optional delivery
   ever affect the business transaction? It should not by default.

If this does not belong in core, a small provider-neutral example can document
the integration boundary without changing default behavior.

Thanks!
