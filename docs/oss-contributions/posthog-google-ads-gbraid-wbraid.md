# Issue review: PostHog Google Ads destination `gbraid`/`wbraid` support

Target: <https://github.com/PostHog/posthog/issues/95999>

Status checked on **2026-09-15**: open, zero comments. Not a ClickTrail-owned
issue. The destination shipped from #27712 with `gclid` support only.

## Observed seam

The issue states the constraint correctly and it is the interesting part:
Google Ads rejects a conversion event that carries **both** `gbraid` and
`wbraid`, so sending both whenever person properties exist is not a valid fix.
The destination also cannot tell which identifier was captured most recently.

This is a reconciliation rule, not a mapping gap. `gbraid` covers iOS web-to-app
clicks and `wbraid` covers iOS app-to-web clicks, so at most one is
attributable for a given click, and the most recently captured one is the better
candidate.

## Smallest useful contribution

A deterministic selection rule that can be unit-tested without any ad platform
call:

1. send `gclid` when it is present and current;
2. otherwise send at most one of `gbraid` or `wbraid`, never both;
3. when both exist, choose the more recently captured value;
4. when recency cannot be established, omit both rather than guess.

Step 4 matters. A wrong click ID is worse than a missing one: Google attributes
the conversion to the wrong click. The rule belongs in the destination template
with test vectors for the four cases above.

The same shape exists in ClickTrail's canonical event contract, and the test
vectors can be shared as plain fixtures. No ClickTrail package, dependency, or
service call belongs in this thread.

## Boundaries

- PostHog owns the destination template, the person-property model, and whether
  recency is available at conversion time.
- This record does not assert that recency is derivable from the current
  `person.properties` shape. If it is not, step 3 may be unimplementable and the
  honest outcome is step 4 alone.
- No claim is made about PostHog conversion delivery or Google acceptance.
  Sending a correctly selected identifier is not proof of a provider receipt.

## Evidence required before proposing

- a unit test showing both identifiers are never sent together;
- a test showing the omission path when recency is unknown;
- the existing destination's current behaviour for the same inputs, to prove the
  change is real and not already handled.

**Disposition:** one focused destination rule with fixtures. Small, testable, and
independent of ClickTrail. The issue is uncommented, so a concise technical
comment that answers the recency question is a reasonable first contribution.
