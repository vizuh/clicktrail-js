# Issue draft: Allow allowlisted storefront context to persist from cart to order

Target: <https://github.com/bagisto/headless-ecommerce>

Status: posted as [590](https://github.com/bagisto/headless-ecommerce/issues/590). Await maintainer feedback before coding.

## Proposed title

Allow allowlisted storefront context to persist from cart to order

## Proposed body

Hi maintainers,

**Is your feature request related to a problem? Please describe.**

Storefront campaign context may be lost between cart creation and order
creation. A provider-neutral extension could preserve a small amount of
allowlisted context without bundling an advertising SDK or exposing arbitrary
checkout JSON.

**Describe the solution you'd like**

Would Bagisto maintainers consider one of these safe boundaries: namespaced cart
metadata, a server-side pre-order event, an order-data transformer, or a
package-owned storage seam? The issue is asking which boundary is preferred
before proposing a GraphQL mutation. A ClickTrail adapter could populate the
context externally.

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

- Documentation for a server-side adapter.
- Package-owned storage outside the public GraphQL input.
- No core support until a concrete storefront integration requires it.

**Additional context**

Any implementation should use namespaced keys, strict server-side allowlists,
string or tightly typed values, maximum sizes, no arbitrary HTML, separate
internal and storefront-writable namespaces, existing cart/session
authorization, and additive migrations where required.

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
