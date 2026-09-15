# Issue review: Odoo Link Tracker drops incoming click ID parameters

Target: <https://github.com/odoo/odoo/issues/268774>

Status checked on **2026-09-15**: open, zero comments, reported by a third party
for versions 17.0, 18.0, and 19.0. Not a ClickTrail-owned issue.

## Observed seam

The report is precise and already identifies the root cause:
`addons/link_tracker/controller/main.py` builds the redirect exclusively from
stored tracker data via `get_url_from_code(code)`. The incoming query string is
never read, so `gclid`, `wbraid`, `gbraid`, `msclkid`, and `fbclid` are dropped
before the landing page while Odoo's own UTM values are appended.

Routing a paid-traffic URL through `/r/<code>` therefore breaks conversion
attribution silently. The click is counted; the identifier never arrives.

## Smallest useful contribution

This is a defect, not a feature request, and the reporter has already done the
diagnosis. The useful contribution is a patch plus a regression test, not a
proposal thread.

The merge rule the issue proposes is the correct one and requires no new
taxonomy:

- incoming query parameters are preserved onto the destination URL;
- Odoo's stored UTM values keep precedence on key collision;
- the click is still counted, and the tracker's own parameters are unchanged.

Any patch should read the incoming query once per redirect, treat every value as
untrusted input, and avoid reflecting arbitrary parameters into the `Location`
header without validation. A bounded allowlist of attribution parameters is
safer than forwarding the entire query string.

## Boundaries

- Odoo owns the routing behaviour, the parameter policy, and whether an
  allowlist or a pass-through is acceptable.
- Preserving a click ID is not the same as storing it. This patch should not
  persist identifiers to `link.tracker.click` or any other Odoo record.
- A redirect fix proves nothing about downstream conversion delivery. Odoo does
  not send conversions to ad platforms, so no provider receipt is in scope.

## Evidence required before proposing

- a reproduction on a supported version showing the current loss;
- the patched redirect output for a URL carrying `gclid` and an unrelated
  parameter;
- a collision case proving Odoo's UTM value wins over an incoming `utm_*`.

Runtime execution was not attempted here. A real patch needs an Odoo runtime,
which is outside this record.

**Disposition:** strong defect-fix candidate. No ClickTrail dependency or
adapter is required for the fix itself; the ClickTrail Odoo adapter is a
separate, optional CRM-side concern and should not be bundled into this thread.
