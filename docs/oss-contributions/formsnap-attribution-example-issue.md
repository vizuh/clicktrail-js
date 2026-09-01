# Issue draft: Proposal: documented consent-aware attribution example for Svelte forms

Target: <https://github.com/svecosystem/formsnap>

Status: posted as [232](https://github.com/svecosystem/formsnap/issues/232). Await maintainer feedback before coding.

## Proposed title

Proposal: documented consent-aware attribution example for Svelte forms

## Proposed body

Hi maintainers,

**Describe the feature in detail**

Would a short Formsnap/SvelteKit guide be useful for carrying first-party
campaign attribution through an existing form submission?

The guide would use a provider-neutral, allowlisted object and the host's own
consent gate. `@vizuh/clicktrail-sveltekit` could be one optional adapter, but
Formsnap would not gain a ClickTrail dependency or default tracking behavior.
It should cover hidden-field or submit mapping, consent denied, absent
attribution, bounded values, and server-side validation.

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

**Provide relevant links or additional information**

Suggested category: **Guide**. The application remains responsible for storage,
access, retention, and downstream events. If a guide is not appropriate, no
runtime change is needed.
