# Issue draft: Proposal: optional consent-aware attribution recipe for Aire forms

Target: <https://github.com/glhd/aire>

Status: posted as [153](https://github.com/glhd/aire/issues/153). Await maintainer feedback before coding.

## Proposed title

Proposal: optional consent-aware attribution recipe for Aire forms

## Proposed body

Hi maintainers,

**Is your feature request related to a problem? Please describe.**

Aire applications may need to preserve first-party campaign context when a
form is rendered and submitted, but Aire does not need to become an analytics
provider to document that handoff.

**Describe the solution you'd like**

Would you consider a documentation-first Laravel recipe for an optional,
provider-neutral attribution object containing allowlisted `utm_*` fields and
approved ad click IDs? The host would validate and store it on its own lead or
booking record. ClickTrail's PHP SDK could be one optional server-side adapter,
but Aire would remain provider-neutral and would not add a required dependency.

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

- A host-side Blade recipe without any Aire code change.
- An extension hook if maintainers identify a stable one.
- No attribution support in Aire core.

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

**Additional context**

The recipe should cover consent denied, absent attribution, bounded values, and
server-side validation. Existing forms must behave unchanged when the recipe is
not used.
