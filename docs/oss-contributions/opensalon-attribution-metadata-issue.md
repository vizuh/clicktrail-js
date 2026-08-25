# OpenSalon issue draft: optional appointment attribution metadata

Target: <https://github.com/clawnify/OpenSalon>

Status: posted as [OpenSalon issue #4](https://github.com/clawnify/OpenSalon/issues/4). Await maintainer feedback before coding.

## Proposed title

Proposal: optional consent-aware attribution metadata for appointments

## Proposed body

Hi OpenSalon maintainers,

OpenSalon already has a clear appointment lifecycle and a typed Hono API. A
small, provider-neutral attribution extension could help self-hosted salon and
appointment businesses understand which campaign produced a booking, without
adding a tracking vendor or changing the default behavior.

Would you consider accepting an optional attribution object on appointment
creation and the corresponding appointment responses?

### Suggested shape

```json
{
  "client_id": 1,
  "staff_id": 2,
  "scheduled_date": "2026-09-01",
  "start_time": "10:00",
  "service_ids": [1],
  "attribution": {
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "summer-bookings",
    "gclid": "example-click-id"
  }
}
```

The field could be nullable and provider-neutral. The implementation could use
a validated JSON column or another storage shape that fits the existing SQLite /
D1 schema. It should not be stored in appointment notes, because notes are
human communication rather than structured integration data.

### Suggested contract

- Accept only an explicit allowlist: `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `gbraid`, `wbraid`,
  `fbclid`, `msclkid`, and `ttclid`.
- Ignore or reject unknown keys consistently with the existing Zod API
  validation style.
- Return the field only to callers that are already authorized to view the
  appointment. If a route is public or has no authorization boundary, omit the
  field rather than exposing campaign identifiers. Keep OpenAPI responses
  consistent with that rule.
- Keep it disabled unless the caller sends it.
- Bound each value and the total object size. Treat all values as untrusted and
  spoofable; never use them for authorization, pricing, booking status, or
  fraud decisions.
- Do not accept names, email addresses, phone numbers, cookies, raw request
  objects, or arbitrary JSON through this field.
- Do not send data to OpenSalon, Clawnify, or another third party. OpenSalon
  should only store the caller-provided values and return them within the same
  access boundary as the appointment.
- The browser cannot prove consent to the server. The caller must send the
  values only after its consent gate allows it; the server should treat the
  field as optional untrusted metadata.
- Document that the caller owns consent, retention, and downstream delivery.

### Optional ClickTrail JS adapter

ClickTrail JS could be one optional browser adapter. It would read the
consent-gated, first-party attribution state and map only the approved fields
into the OpenSalon request. OpenSalon would not need to depend on ClickTrail.

```ts
import { createClickTrail } from '@vizuh/clicktrail/browser';

const clickTrail = createClickTrail({
  destinations: [],
  consentGate: () => hasMarketingConsent(),
  forms: {},
});

clickTrail.start();

const attribution = pickAllowedAttribution(clickTrail.getData());
await fetch('/api/appointments', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...appointmentInput, attribution }),
});
```

The adapter would remain optional. A normal OpenSalon installation would not
load ClickTrail, persist anything, or send telemetry.

### Proposed tests

- Appointment creation works exactly as before when `attribution` is absent.
- An allowlisted attribution object is stored and returned only within the
  authorized appointment response boundary.
- Unknown keys, oversized values, and malformed values are rejected or removed
  according to the agreed validation rule.
- Public or unauthenticated responses do not expose the field.
- Attribution values cannot affect authorization, price, status, or booking
  decisions.
- No data is sent to a third party by OpenSalon itself.

Before implementation, it would help to confirm the product need and scope:

1. Do OpenSalon users want attribution at the appointment level, or would it be
   more useful on clients, reports, exports, or future webhooks?
2. Where should an administrator actually see it: appointment detail, calendar,
   client history, a report, an API response, CSV export, or nowhere in the UI
   at first?
3. Is a provider-neutral storage field wanted in core, or would a documented
   adapter/extension be a better fit?
4. What is the acceptable impact on the browser bundle? A native browser
   capture feature would add code and maintenance; an optional ClickTrail
   adapter adds no required OpenSalon dependency and can remain outside the
   default bundle.
5. What is the acceptable code and schema impact? A native field touches the
   request schema, database migration, appointment queries, response schemas,
   API docs, and tests. Existing rows should remain valid and the field should
   be nullable.
6. What is the acceptable blast radius for API consumers, D1 migrations,
   backups, exports, logs, and retention? The field should be additive and
   should not change existing appointment behavior when omitted.
7. Does OpenSalon have an intended authorization boundary for these values?
   If not, should attribution stay out of public responses until one exists?

If the answer is that users do not need this in core yet, a small integration
recipe can still document how a self-hosted operator carries allowlisted
attribution into the existing appointment request without changing OpenSalon's
bundle or schema.

Thanks!
