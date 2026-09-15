# Issue review: Matomo deferred campaign attribution after consent

Targets:
<https://github.com/matomo-org/matomo/issues/24882> and
<https://github.com/matomo-org/matomo/issues/24751>

Status checked on **2026-09-15**: both open. #24882 has one comment; #24751 has
two. Not ClickTrail-owned issues. Both frame the same underlying constraint.

## Observed seam

Under the January 2026 CNIL position, the incoming UTM values may not be
recorded until the visitor grants consent. Matomo is configured for anonymous
measurement before consent, so the campaign parameters are ignored on the
landing page. After consent is granted there is no supported way to begin using
those values, and the common workaround is a second pageview, which inflates
pageview counts.

The requested behaviour in #24882 is the important part: **hold the incoming
value without recording it**, then apply it once consent is granted, with no
redundant pageview. #24751 asks the same thing from the other direction, by
consuming Consent Mode `default`/`update` signals from the `dataLayer` instead
of defining a separate consent protocol.

This is a genuine gap: the landing page is the only moment the campaign value
exists, and the consent decision arrives after it.

## Smallest useful contribution

The separable design question is a consent-gated snapshot:

- capture the landing campaign parameters in memory at load;
- keep them out of cookies, storage, and any request payload while consent is
  unknown or denied;
- apply the held value at the moment consent is granted, without a second
  pageview;
- keep `unknown` and `denied` behaviour identical, so no new persistence path
  is created by accident;
- discard the held value if consent is never granted.

This matches the ClickTrail consent-compatibility position: consume the CMP
decision, never compete with it. ClickTrail is not proposed as a dependency
here; the same rule can be implemented inside `matomo.js` with no new package
and no new vendor.

## Boundaries

- Matomo owns its consent policy, its `requireConsent` semantics, and the
  retention decision for any held value.
- Holding a value in memory is not the same as recording it, but maintainers
  should decide whether an in-memory hold is acceptable under their own reading.
- No legal or compliance claim is made here. "Handles deferred consent
  correctly" is a behaviour description, not a certification.
- #24751 is a broader architectural decision. Reusing Consent Mode signals would
  change Matomo's consent source of truth, which is a maintainer call and should
  not be presented as an easier fix than it is.

## Evidence required before proposing

- a reproduction showing the campaign value is lost on the landing page and
  cannot be recovered after consent without a second pageview;
- proof that the held value is absent from cookies, storage, and outgoing
  requests while consent is unknown;
- a pageview count that does not increase when consent is granted.

Runtime execution was not attempted here. This needs a Matomo runtime and a CMP
fixture.

**Disposition:** design discussion is the correct first contribution. Do not
open with a code proposal; the two issues disagree about where the consent
source of truth should live, and that must be settled by maintainers first.
