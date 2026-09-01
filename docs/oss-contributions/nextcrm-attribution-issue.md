# Issue draft: Proposal: optional attribution metadata for CRM lead creation

Target: <https://github.com/pdovhomilja/nextcrm-app>

Status: posted as [305](https://github.com/pdovhomilja/nextcrm-app/issues/305). Await maintainer feedback before coding.

## Proposed title

Proposal: optional attribution metadata for CRM lead creation

## Proposed body

Hi maintainers,

**Is your feature request related to a problem? Please describe.**

A CRM lead or contact created from an external form may lose the first-party
campaign context that accompanied creation. NextCRM has server actions, Zod
validation, PostgreSQL/Prisma, permissions, audit history, and exports, so a
native field would have a meaningful maintenance surface.

**Describe the solution you'd like**

Would maintainers want an optional provider-neutral attribution object on lead
or contact creation? A ClickTrail browser adapter could populate it, but
NextCRM should not require ClickTrail or send data to a vendor.

The first step should confirm the correct CRM record, user-facing surface, and
whether a native field, extension, or documentation recipe is preferred.

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

- A provider-neutral external adapter with no Prisma migration.
- A related provenance table rather than fields on the lead/contact.
- Documentation only until users demonstrate demand.

**Additional context**

A native field would touch a Prisma migration, server-action validation,
permissions, detail pages, exports, audit behavior, and tests. Existing records
must remain valid and behavior must be unchanged when attribution is absent.

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
