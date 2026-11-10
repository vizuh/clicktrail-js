# Dapta Forms — cross-origin embed attribution boundary

**Upstream**: [Dapta-Tech/dapta-forms](https://github.com/Dapta-Tech/dapta-forms)
**Issue**: [#199](https://github.com/Dapta-Tech/dapta-forms/issues/199) — *feat(embed): pass the HubSpot visit (hutk, page URL, landing UTMs) from embedded forms*
**Our comment**: [issuecomment-5846494000](https://github.com/Dapta-Tech/dapta-forms/issues/199#issuecomment-5846494000)
**Posted**: 2026-09-25
**Status**: Open, 0 maintainer responses at time of posting. Issue label
`ready-for-agent`, opened 2026-09-24 by `josue-commits` (paying customer JAH
Insurance).

## Why this is worth a record

A genuinely new **surface** for ClickTrail: cross-origin embedded forms. The
existing contribution records cover native forms, carts, appointments and
checkout metadata. An embeddable form product has to invent its own
attribution transport, and the resulting protocol is bespoke per vendor. The
same primitive applies to booking widgets, quote forms, calculators,
Typeform-like forms and payment widgets.

## What the issue is

Meta ads to HubSpot landing pages to an embedded Dapta form to a HubSpot
contact. The host landing knows `hubspotutk`, the full URL, UTMs, `fbclid`,
page title and HubSpot `page_id`. The form is a cross-origin iframe on
`forms.dapta.ai` and cannot see any of it, so the contact arrives without
original source, campaign, page views or landing UTMs.

## Why this is a B and not an A

The maintainer had already designed the implementation, including the
`postMessage` handshake, the persistence model, the COALESCE merge semantics,
the per-field validation table, the HubSpot opt-out handling, and a 27-row
blast radius. There is no unclaimed boundary left to propose. Per the operating
boundary in [README](./README.md), a contribution is not a reason to change an
upstream issue state.

## What we actually contributed

Not a replacement for their handshake, which is correct. Two observations, both
framed as questions:

1. **One versioned envelope instead of growing field sets.** Their protocol
   carries `hutk`, `pageUri`, `pageName`, `pageId?`, `hsPortalId?` plus a
   separate `mergeHostUtm` path. Every future click ID or ad platform becomes a
   new message field and a new validation row rather than a key in a
   restricted allowlist. Proposed an `acquisition: { v: 1, utm, clickIds,
   landing, referrer }` envelope that the HubSpot adapter reads a subset of, so
   the protocol stops growing.

2. **The minimisation split.** Their rule stores `hutk` only when something
   consumes it, which is right. Pointed out that page URL, title, UTMs and
   click IDs are not identifiers in the same sense, so they could be stored
   unconditionally while `hutk` stays conditional. A customer enabling the
   HubSpot mirror later would still have the landing context, with no change to
   `hutk` behaviour.

Also noted that `ipAddress` and the R2 mirror/upsert ordering check look like
the real risks, by their own assessment.

## Boundary compliance

- No dependency proposed. The issue already has a working design.
- No PII or raw requests requested. We explicitly endorsed their `hutk`
  minimisation rather than asking for it.
- Upstream owns consent, retention, access control and delivery.
- No claim that ClickTrail was adopted. This is a contribution record only.

## Cross-project lessons

- **The embed boundary is under-evidenced in our own docs too.** ClickTrail's
  `crossDomain` path is approved-domain link decoration plus a signed landing
  continuation token. An embedded third-party iframe is a different shape: no
  shared storage, no approved-domain cookie, and the receiving party is a
  vendor. `postMessage` with strict origin checks is the only available
  transport, and the receiving origin is by definition not ours.
- **A host-owned reference beats a growing field list.** The same argument that
  produced `attributionRef` in
  `clicktrail-examples/gclid-gbraid-wbraid-lead` applies one boundary earlier:
  stamp one stable reference at capture, let each destination adapter consume
  the subset it understands.
