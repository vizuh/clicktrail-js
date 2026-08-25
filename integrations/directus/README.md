# directus-extension-clicktrail

First-party attribution and conversion tracking for [Directus](https://directus.io):
a Flow operation to send ClickTrail events, an API hook that attaches
attribution signals on collection creates, a Campaign → Lead → Sale dashboard
panel, and a settings module.

All events are built through the shared `@vizuh/clicktrail` common layer —
every outbound event carries `schema_version`, `classifier_version`, and the
`marketing_trail` envelope. Event names follow the cross-integration contract:

```
lead · lead.attribution_attached · lead.stage_updated · lead.qualified ·
lead.merged · booking · appointment.completed · sale.recorded ·
revenue.recurring · refund.issued · offline_conversion.sent ·
consent.granted · consent.withdrawn · consent.policy_updated
```

## The four components

| Component | Type | Side | What it does |
|---|---|---|---|
| **Send event to ClickTrail** | Flow operation (`clicktrail-send-event`) | API | Builds one stamped event from Flow config and POSTs `{ events: [...] }` to your collector. Never fails the Flow on analytics outages. |
| **Attribution hook** | API hook | API | On `items.create` in configurable collections (default `leads`, `bookings`, `orders`), extracts attribution signals and forwards the mapped event. Optionally stores events locally for the panel. |
| **Campaign → Lead → Sale panel** | Dashboard panel (`clicktrail-funnel`) | App | Three-stage funnel over locally stored events, with a per-campaign breakdown. |
| **ClickTrail Settings module** | Settings module (`clicktrail-settings`) | App | Form for site ID, endpoint, masked API key, consent flag, field mappings. |

## Install

```bash
# inside your Directus project
pnpm add directus-extension-clicktrail

# or from this monorepo
pnpm install && pnpm --filter directus-extension-clicktrail build
```

Registry listing: the package.json carries the required `directus-extension`
keyword plus a `directus.host` field (`^10 || ^11`). Those two fields make the
package discoverable by Directus extension registries/marketplace mirrors,
typically within hours of npm publish.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CLICKTRAIL_ENDPOINT` | yes (hook) / per-flow (operation) | Collector URL receiving `{ events: [...] }`. |
| `CLICKTRAIL_SITE_ID` | recommended | Stamped into every event's `marketing_trail.site_id`. |
| `CLICKTRAIL_API_KEY` | optional | Sent as `X-ClickTrail-Key` for the env endpoint. Never logged, never stored in dashboard state. |
| `CLICKTRAIL_STORE_LOCALLY` | optional | `true` writes each forwarded event into the `clicktrail_events` collection (panel data source). |

## Flow setup walkthrough

1. Create a Flow with any trigger (e.g. item created on `orders`).
2. Add an operation of type **Send event to ClickTrail**.
3. Configure:
   - **Event name**: one of the contract names above (e.g. `sale.recorded`).
   - **Payload**: optional JSON object string, e.g.
     `{"lt_campaign":"spring","visitor_id":"v_123"}`.
   - **Site ID / Workspace ID / Consent flags**: optional overrides; unset
     fields fall back to env vars.
4. Run the flow — check the collector received a batch with one stamped event.

![Flow operation configuration](docs/screenshots/flow-operation.png)

## Collection mapping example

The hook inspects item payloads for these signal shapes (all optional):

```jsonc
{
  "ft_source": "google",              // stored flat first/last touch state
  "lt_medium": "cpc",
  "utm_source": "newsletter",         // bare utm_* keys become a last touch
  "gclid": "Cj0KCQ…",                 // click ids: gclid/fbclid/ttclid/msclkid/li_fat_id
  "visitor_id": "v1", "trail_id": "trl_1", "session_id": "s1",
  "landing_url": "https://site.test/?utm_campaign=may",   // full URL parse…
  "referrer": "https://www.facebook.com/"                  // …with referrer rules
}
```

URL-shaped input goes through the SDK's canonical
`parseAttributionUrl → mergeAttributionTouch`, so first-touch write-once and
last-touch overwrite behave exactly like every other ClickTrail integration.

Collection → event map: `leads → lead`, `bookings → booking`,
`orders → sale.recorded`.

### Local storage collection

When `CLICKTRAIL_STORE_LOCALLY=true`, create a `clicktrail_events` collection
with fields: `event_name` (string), `campaign` (string), `lead_id` (string),
`occurred_at` (timestamp), `payload_json` (text). The panel reads it via
`GET /items/clicktrail_events`.

## Settings module save wiring

The settings form validates through the pure `validateSettings()` helper and
emits a `save` event with normalized settings
(`{ siteId, endpoint, apiKeyMasked, consentRequired, fieldMappings }`).
Persistence is intentionally left to the host: wire the emitted payload to
your own storage lane (e.g. a `settings` singleton via the Directus API or a
small custom hook listening for it). Server-side runtime values are always
env vars — the form is dashboard-level defaults only.

## Trust model

See [`src/TRUST-MODEL.md`](src/TRUST-MODEL.md). Short version: server pieces
need network egress (hence unsandboxed v1, with the tradeoff documented);
dashboard pieces inherit admin auth; no browser-injection JavaScript ships in
this package at all.

## Development

```bash
pnpm install --filter directus-extension-clicktrail
pnpm --filter directus-extension-clicktrail build    # tsc + esbuild app bundles
pnpm --filter directus-extension-clicktrail test     # vitest
```

MIT © Vizuh OÜ
