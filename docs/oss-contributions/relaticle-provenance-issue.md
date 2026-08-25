# Issue draft: Record observed acquisition provenance on people and deals

Target: <https://github.com/relaticle/relaticle>

Status: original issue [#531](https://github.com/relaticle/relaticle/issues/531) was closed because feature ideas belong in Discussions; moved to [Ideas discussion #532](https://github.com/orgs/relaticle/discussions/532).

## Proposed title

Record observed acquisition provenance on people and deals

## Proposed body

Hi maintainers,

Relaticle already has durable Person and Deal records plus REST/MCP surfaces.
Would an append-only, provider-neutral provenance record be useful for explaining
where an externally created Person or Deal originated?

The record could contain an observed timestamp and allowlisted source, medium,
campaign, and click-ID values. It should be visible only on authorized Person
or Deal views and corresponding authorized API/MCP reads. It must not let a
public form rewrite historical provenance, impersonate an internal actor, attach
to another workspace, or change protected CRM fields.

This is a provenance seam, not a marketing dashboard. A ClickTrail adapter could
populate it externally, while qualification, won, and revenue remain separate
authorized CRM events.

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
