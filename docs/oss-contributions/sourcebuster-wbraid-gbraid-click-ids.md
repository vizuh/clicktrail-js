# Contribution record: Sourcebuster `gbraid`/`wbraid` click ID handling

Target: <https://github.com/woocommerce/sourcebuster-js> (upstream original:
<https://github.com/alex35mil/sourcebuster-js/issues/39>)

Status checked on **2026-09-15**: upstream issue #39 is open with no maintainer
response. The local checkout is a fork of `woocommerce/sourcebuster-js`, whose
default branch is `trunk`.

Branch: `feat/wbraid-gbraid-click-ids`, pushed to `vizuh/sourcebuster-js`
(commit `de64772`), based on `trunk`. **No pull request opened.**

## Observed seam

`src/js/init.js` recognised only `gclid` and `yclid` as click identifiers. A
visit tagged solely with `gbraid` (iOS web-to-app) or `wbraid` (iOS app-to-web)
did not satisfy the UTM branch in `mainData()`, so it fell through to referral
or typein classification. The session was never attributed to
`google` / `cpc` / `google_cpc`, which is the same outcome the issue reports.

Sourcebuster backs WooCommerce order attribution, so the misclassification
reaches stored order records, not only a cookie.

## Smallest useful contribution

Route `gbraid` and `wbraid` through the existing Google click path rather than
adding a new taxonomy. Explicit `utm_*` parameters keep precedence.

- added `isGoogleClick()` covering `gclid`, `gbraid`, and `wbraid`;
- used it in the `mainData()` entry condition and the source, medium, and
  campaign branches.

## Evidence

- `test/click-ids.test.js` covers both new parameters, the existing `gclid` and
  `yclid` routing, utm precedence over the click IDs, and the direct and organic
  cases.
- The test is red-capable: it fails against the unmodified `init.js` with
  `wbraid should be classified as utm traffic` and passes with the change.
- `npm test` green after the change.

`trunk` has no test directory and no `test` script, so this branch adds both.
The change is source-present and Node-verified only; it was not exercised in a
browser or through WooCommerce order attribution at runtime.

## Boundaries

- This is a classification change, not a new storage surface. Sourcebuster still
  does not persist the raw click ID, and this change does not add it.
- No new parameter is invented and no vendor SDK is introduced.
- The upstream project owns whether `gbraid`/`wbraid` should be classified
  identically to `gclid`; a maintainer may prefer a distinct source or medium.

**Disposition:** ready to propose upstream as a pull request. Runtime behaviour
in a real browser and in WooCommerce order attribution remains unverified.
