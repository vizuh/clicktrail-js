# phpList issue: optional PHP signup-attribution bridge

Target: <https://github.com/phpList/phplist3>

Status: posted as [phpList issue #1140](https://github.com/phpList/phplist3/issues/1140). Existing issue [#556](https://github.com/phpList/phplist3/issues/556) concerns adding custom parameters to outbound campaign links; this proposal concerns inbound signup attribution and does not replace or duplicate it.

## Proposed title

Proposal: optional PHP/plugin bridge for consent-aware signup attribution

## Proposed body

Hi phpList maintainers,

I found [issue #556](https://github.com/phpList/phplist3/issues/556), which
covers custom tracking parameters on outbound campaign links. This is a
different, inbound use case: preserving the campaign that led someone to a
phpList subscription form and, optionally, notifying a conversion adapter only
after the subscription is confirmed.

Would phpList users find an optional, provider-neutral signup-attribution
extension useful?

### Smallest useful shape

A plugin or documented integration could, where the existing subscriber
attribute and subscription hooks support it:

1. Read an explicit allowlist from the host's subscription form request.
2. Store it as a named attribution value on the subscriber or subscription
   record, rather than mixing it into an email, URL, or arbitrary attribute.
3. Preserve it through confirmation without changing normal subscription
   behavior.
4. Expose it only in an authorized admin/API/report/export surface selected by
   the maintainers.
5. Optionally emit a server-side `lead` or `subscription_confirmed` event after
   confirmation, using a stable non-PII idempotency key.

ClickTrail's PHP SDK (`clicktrail/php-sdk`) could be one optional adapter for
that final server-side event. It provides a `Lead` event, consent-aware
building blocks, batching, retries, and idempotency. phpList would not need to
depend on ClickTrail, send telemetry to ClickTrail by default, or make the SDK a
core requirement. A provider-neutral plugin contract or documentation recipe
would be useful even without ClickTrail.

### Where users might see it

This needs product guidance before implementation. Possible surfaces are the
subscriber detail page, an admin report, an export, or an API response. It
should not appear in public subscription pages or public endpoints by default.

### Impact questions

- Is inbound signup attribution useful to phpList users, separately from
  outbound campaign-link parameters in #556?
- Should it belong to subscribers, subscription confirmations, or an external
  integration record?
- Would a plugin/recipe be preferable to a core schema and admin change?
- What is the acceptable impact on the public subscription-page bundle? A
  server-side plugin can add no required frontend dependency; any browser
  adapter can remain optional.
- What would be the impact on subscriber attributes, confirmation flows, API
  responses, exports, backups, logs, and retention?
- Which existing hook is safe for a confirmed-subscription event, and how should
  failed delivery be queued without blocking confirmation?

### Safety boundary

- Disabled by default and opt-in per installation.
- The host owns consent, retention, access control, and delivery configuration.
- Allowlist only: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
  `utm_term`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, and `ttclid`.
- Bound every value and the total object size.
- Treat browser-supplied values as untrusted and spoofable.
- Do not use attribution for subscription authorization, deliverability,
  segmentation permissions, or account security decisions.
- Do not capture or send email addresses, names, phone numbers, cookies,
  visitor/session IDs, raw URLs, referrers, or arbitrary attributes by default.
- Do not expose attribution to an unauthorized caller.
- Do not block or alter subscription confirmation if an optional conversion
  delivery fails.
- Do not test against the public demo with real subscriber data.

If this use case is useful, I can prepare a focused plugin/recipe proposal after
maintainers confirm the supported hook, storage surface, and desired user-facing
view. If it is not useful in phpList core, an external integration guide could
still document the boundary without changing the default installation.

Thanks!
