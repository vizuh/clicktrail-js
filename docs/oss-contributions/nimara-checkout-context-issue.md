# Issue draft: Document an optional acquisition-context path through checkout metadata

Target: <https://github.com/mirumee/nimara-ecommerce>

Status: posted as [783](https://github.com/mirumee/nimara-ecommerce/issues/783). Await maintainer feedback before coding.

## Proposed title

Document an optional acquisition-context path through checkout metadata

## Proposed body

Hi maintainers,

Nimara's Saleor checkout integration appears to offer a useful documentation
surface for carrying consent-gated acquisition context through checkout and into
an order-created integration.

Would maintainers accept a typed, provider-neutral example using a reserved
metadata namespace, with verification that the data survives order creation?
The example could cover a host-owned consent gate, checkout metadata, and an
order webhook consumer without loading an analytics bundle by default. It should
also distinguish storefront-writable values from private order metadata and
avoid assuming that all metadata is safe to expose publicly.

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
