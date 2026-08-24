# @vizuh/clicktrail-piece

[Activepieces](https://www.activepieces.com) piece for
[ClickTrail](https://github.com/vizuh/clicktrail-js): turn any automation into
schema-stamped, attribution-aware first-party events. Every action translates
its inputs into exactly ONE event via the shared `@vizuh/clicktrail` SDK
(`buildEventPayload`) and POSTs `{ events: [event] }` to the ClickTrail
collector. No attribution logic lives in this package — the SDK owns it.

## Install

```bash
npm i @vizuh/clicktrail-piece
```

Inside an Activepieces deployment you can also drop the built package into the
pieces directory, or contribute it upstream (see below).

## Connection setup

Create a ClickTrail connection (Custom Auth):

| Field | Required | Notes |
| --- | --- | --- |
| API Key | yes | Sent as the `X-ClickTrail-Key` header |
| Site ID | yes | Site these events belong to |
| Workspace ID | no | Stamped into the `marketing_trail` envelope |
| Base URL | no | Defaults to `https://events.clicktrail.example`; override for self-hosted |

Validation is field-shape only (non-empty API key + site ID). The collector has
no read/verify endpoint yet, so a "test connection" ping would mean sending a
fake tracking event — worse than trusting your fields. A bad credential
surfaces as an action error on the first real send.

## Actions

| Action | Event name | Required inputs | Optional inputs |
| --- | --- | --- | --- |
| Track Event | free string from input | eventName | data (JSON object) |
| Identify Lead | `lead` | — | visitorId, email, leadId, name |
| Attach Attribution | `lead.attribution_attached` | — | visitorId, source, medium, campaign |
| Record Booking | `booking` | — | value (positive), currency, startDate |
| Record Qualified Lead | `lead.qualified` | leadId | — |
| Record Sale | `sale.recorded` | transactionId, value (positive), currency | — |
| Record Refund | `refund.issued` | originalTransactionId | value (positive) |
| Update Consent | `consent.granted` / `consent.withdrawn` / `consent.policy_updated` | state (dropdown drives the name) | source, policyVersion |

Each send resolves to `{ ok, status, event }` on success (`event` is the exact
stamped payload that was delivered) and rejects with an error naming the action
when delivery fails.

## Example automation: form submitted -> sale

1. **Trigger:** your form tool's "New submission" trigger (or any CRM trigger).
2. **Identify Lead** — pass the submitter's email + your lead ID.
3. **Attach Attribution** — attach source/medium/campaign captured by your form.
4. **Record Sale** — when checkout completes downstream, record transaction id,
   value, and currency. ClickTrail stitches the trail via the SDK stamps.

## Self-hosted endpoint

Point the connection's **Base URL** at your self-hosted collector. Events are
POSTed as `{"events":[{...}]}` to that root URL with the `X-ClickTrail-Key`
header.

## Triggers: deferred

The three planned triggers (**New Lead**, **Conversion Recorded**, **Consent
Changed**) are explicitly deferred until ClickTrail exposes stable outbound
webhooks — Activepieces triggers need polling sources or webhook receivers, and
ClickTrail currently exposes neither. See
[src/TRIGGERS-DEFERRED.md](./src/TRIGGERS-DEFERRED.md) for each gate and a
one-line sketch.

## Upstream contribution path

The community path is a PR into the
[activepieces monorepo](https://github.com/activepieces/activepieces), where
the piece would be renamed `@activepieces/piece-clicktrail` under
`packages/pieces/clicktrail/`. This standalone scoped publish
(`@vizuh/clicktrail-piece`) is fine meanwhile; keep the diff mechanical
(package name, imports, registry metadata) so the future PR stays small.

## Development

```bash
pnpm install --filter @vizuh/clicktrail-piece
pnpm --filter @vizuh/clicktrail-piece build   # tsc -p tsconfig.build.json -> dist/
pnpm --filter @vizuh/clicktrail-piece test    # vitest run
```

## License

MIT
