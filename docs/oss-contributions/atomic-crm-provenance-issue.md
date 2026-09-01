# Issue draft: [RFC] Add a provider-neutral lead-ingestion provenance seam

Target: <https://github.com/marmelab/atomic-crm>

Status: posted as [351](https://github.com/marmelab/atomic-crm/issues/351). Await maintainer feedback before coding.

## Proposed title

[RFC] Add a provider-neutral lead-ingestion provenance seam

## Proposed body

Hi maintainers,

**Is your feature request related to a problem? Please describe.**

Source context can be lost between an external form, a lead, a contact, and a
deal. Atomic CRM would not need to implement browser tracking or advertising
reporting to preserve a small amount of observed provenance.

**Describe the solution you'd like**

Would maintainers consider a typed, provider-neutral provenance seam at the
lead-ingestion boundary? It could be an extension table, provider contract, or
lead-import path. The data crossing the boundary should be parsed into a domain
type, not accepted as a raw open object.

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

**Describe alternatives you've considered**

- Keep provenance in an external adapter.
- Use a related table rather than adding fields to CRM records.
- Defer provenance until a concrete import integration needs it.

**Additional context**

The first version only needs to preserve allowlisted observed source context.
It does not need ad-platform reporting, ROI dashboards, or browser tracking in
core.

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
