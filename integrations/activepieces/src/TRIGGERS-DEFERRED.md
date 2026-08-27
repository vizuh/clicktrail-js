# Deferred Triggers

Per the repo rule against half-built specs, the three planned ClickTrail
triggers are deferred, not stubbed. All three are gated on ONE precondition:

> **Gate:** stable ClickTrail outbound webhooks (signed, at-least-once
> delivery) exposed by the collector. Activepieces triggers need either a
> polling source or a webhook receiver; ClickTrail currently exposes neither.

## 1. New Lead (`lead_created`)

Fires when a new lead is identified in ClickTrail.

Sketch: `createTrigger({ type: TriggerStrategy.WEBHOOK }) — register the
Activepieces webhook URL with ClickTrail via a future
`POST <collector>/webhooks` API in `onEnable`, filter `event_name === 'lead_created'`,
hand `payload.events[0]` to the flow in `run`, deregister in `onDisable`.

## 2. Conversion Recorded

Fires when a booking/sale/refund event lands for a trail.

Sketch: same webhook-trigger skeleton as New Lead; filter on
`marketing_trail.event_name ∈ {'booking_created', 'booking_completed', 'sale', 'refund'}`
and pass the stamped event through.

## 3. Consent Changed (`consent_updated`)

Fires when a visitor's consent state changes.

Sketch: same webhook-trigger skeleton as New Lead; filter on
`marketing_trail.event_name === 'consent_updated'`; branch on `consent_state`
and pass the stamped event through.

When the webhook API ships, implement all three in `src/triggers/`, add them
to `triggers: []` in `src/index.ts`, and delete this file.
