# Issue review: Hauddy campaign attribution and acquisition outcomes

Target: <https://github.com/Hauddy/hauddy/issues/95>

Status checked on **2026-09-15**: open, with no maintainer comments. The issue's own
review names the relevant paths and records that v0.1.20 already stores aggregate
`form_start`, request, verification, invitation, claim, and activation events.

## Observed seam and cause

Hauddy already has a native acquisition path:

- the landing form submits `source`;
- the backend accepts approved labels and groups other values as `campaign`;
- the first stored waitlist source is retained;
- activation is counted after an actual non-human recipient acknowledges a message.

The unresolved problem is not “missing ClickTrail.” It is that the current model does
not document medium/campaign conventions or expose a bounded, readable report. Existing
request counters include retries, so attempts must not be read as people or verified
activation.

## Maintainer-first contribution

A useful first patch would be native documentation and a small aggregate report or
query, if the maintainers want those surfaces. A ClickTrail adapter should be considered
only at the existing `/preregistration/request` boundary and only if Hauddy needs a
standard first-touch envelope. It must not duplicate the waitlist or activation model.

The minimum declared inputs are:

- an approved `source`/campaign label from a versioned configuration;
- event name and count semantics (`form_start`, request, verification, invitation, claim,
  activation);
- a time window if the maintainers later add date/cohort storage;
- a stable internal record ID for joins, never an email or token in a report.

Do not silently turn arbitrary `utm_*` query values into campaign labels. If medium and
campaign are needed, the maintainers should define their representation and release/deploy
configuration first.

## Boundaries and acceptance

- Hauddy owns consent, retention, labels, waitlist records, verification, and activation
  truth.
- ClickTrail would own only optional acquisition context and would not decide whether an
  agent activated.
- Retries and duplicate requests must be tested separately from unique people.
- Unknown labels must follow the documented bucket and never become an unbounded taxonomy.
- Reports must contain channel, event, timeframe, and caveats, but no email, token,
  message body, or credential.

**Disposition:** native documentation/report opportunity; no ClickTrail runtime PR until
Hauddy confirms that its existing source model cannot satisfy the need.
