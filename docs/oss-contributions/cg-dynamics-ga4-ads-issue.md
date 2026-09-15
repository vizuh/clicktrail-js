# Issue review: CG Dynamics Google Ads → GA4 website performance

Target: <https://github.com/CGProductionHouse/CG-Dynamics/issues/335>

Status checked on **2026-09-15**: open. PR [#336](https://github.com/CGProductionHouse/CG-Dynamics/pull/336)
is already active and covers the requested Google Ads/GA4 reporting path. It keeps Ads
provider truth separate from GA4 website behaviour and remains subject to CA-gated live
provider setup.

## Why ClickTrail should not own this feature

The issue is primarily a provider-reporting and exact-client mapping problem. The active
PR already addresses:

- exact `client_id` → Ads campaign/account → GA4 property/domain mapping;
- runtime GA4 metadata validation;
- separate Ads clicks and GA4 sessions;
- truthful unavailable/setup-required states instead of fabricated zeroes;
- CTA/key-event availability and Admin Preview/client parity;
- campaign-type-aware ValueTrack guidance.

A ClickTrail package would duplicate that reporting architecture. The only possible
ClickTrail seam is an optional event attached to a verified enquiry or CTA, if the
maintainers later identify a missing site-side event contract.

## Parameters and boundaries

- exact client, campaign, property, and approved domain IDs are server/config-owned;
- `gclid`/UTM context may support a deterministic enquiry join, but Ads clicks are not
  equated with GA4 sessions;
- CTA names and key events come from the client’s configured taxonomy, not guessed names;
- `setup_required`, `not_tracked`, and `unavailable` must remain distinct from a real
  numeric zero;
- Ads account changes, auto-tagging, Final URL suffixes, credentials, migrations, and
  deployment remain CA/provider gates.

ClickTrail must not scrape GA4, recalculate Ads clicks/spend, select a client by fuzzy
name, or claim provider delivery from a local event.

**Disposition:** do not duplicate PR #336. Revisit only for a narrowly defined, optional
site enquiry-event recipe after the existing reporting work is merged and its owners ask
for it.
