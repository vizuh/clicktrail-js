# Issue review: matchXelerate consent-aware UTM/GCLID persistence

Target: <https://github.com/OS-labs-digital/matchxelerate-web/issues/22>

Status checked on **2026-09-15**: open, with no maintainer comments. The repository's
`docs/SPEC.md` is the source of truth. It already establishes Next.js App Router,
GTM/GA4 through `src/lib/analytics.ts`, HubSpot server-side forms, and Hungarian and
English routes.

## Observed seam

The issue asks for four related but separable behaviours:

1. Consent Mode v2 defaults to denied before GTM.
2. The cookie banner owns the transition to granted and remembers that choice for 180
   days.
3. Typed events carry the specified parameters, including `locale` on navigation.
4. UTM values and `gclid` survive navigation from the first landing to a later form.

ClickTrail can help with item 4 and the server-side attachment boundary. It must not
replace the site's CMP, GTM container, HubSpot submission, or locale taxonomy.

## Maintainer-first contribution

The smallest useful artifact is a dependency-free Next.js reference example in
ClickTrail, plus tests for the three-page journey. It should be optional and easy to
remove. It should show both the ClickTrail path and the no-package host implementation.
No ClickTrail dependency belongs in this application unless its maintainers request
one after reviewing the existing `analytics.ts` seam.

Recommended parameters:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content`;
- `gclid` and, only if the campaign setup uses them, `gbraid`/`wbraid`;
- the host-owned `locale` value on `page_view`;
- the host-owned form/event name and a server-owned lead reference.

The issue describes the attribution cookie as session-lived. That choice should remain
with the maintainers; ClickTrail's longer default must not silently override it. The
180-day retention applies to the consent choice, not automatically to all attribution.

## Boundaries and evidence

- The host CMP is the consent authority. Unknown or denied consent must not persist
  advertising identifiers.
- GTM remains host-owned. ClickTrail must not inject a second GTM snippet or invent
  event names.
- Browser values are untrusted context. HubSpot and any lead ID are server-owned.
- No email, phone, cookie header, or raw request belongs in a data-layer event.
- “Seen in GTM Preview” proves tag wiring only; it does not prove HubSpot storage or
  provider conversion delivery.

## Acceptance for a reference example

- `?utm_source=linkedin&utm_campaign=kickoff` survives three synthetic pages and is
  present on the final `form_submit` attachment.
- Denied consent creates no advertising persistence; granting consent does not rewrite
  an earlier first touch with a later campaign.
- Missing `NEXT_PUBLIC_GTM_ID` leaves the app error-free and loads no snippet.
- Both locales use the same event contract and the expected `locale` parameter.
- Tests contain synthetic identifiers only and show no raw form data in diagnostics.

**Disposition:** strong reference-example opportunity; no host-repository code or
package installation proposed.
