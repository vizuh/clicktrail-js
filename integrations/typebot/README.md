# @vizuh/clicktrail-typebot

ClickTrail attribution for Typebot conversations. Maps Typebot variables onto canonical ClickTrail fields, builds the eight tracking events, and POSTs them to your first-party endpoint.

**Never-throws guarantee:** `send` resolves `{ ok, status }` and NEVER throws into the host flow. A chatbot must never break because analytics is down — network failures, bad responses, and encoding errors all collapse to `{ ok: false }`. The only rejections are validation errors (required money/id fields), which surface as promise rejections with `'<action>.<field>'` TypeError wording so misconfigured flows fail loudly at build/test time, not mid-conversation.

Zero runtime dependencies. Zero `@typebot.io` imports by design (see "Upstream PR path").

## Variable mapping table

| Typebot variable | Canonical field | Used by |
|---|---|---|
| `{{Email}}` | `email` | lead, form.submitted, sale.recorded |
| `{{Phone}}` | `phone` | lead, form.submitted |
| `{{Lead ID}}` | `lead_id` | **required** for `lead.qualified` |
| `{{utm_campaign}}` | `campaign` | attribution passthrough on every event |
| `{{gclid}}` | `gclid` (click id) | attribution passthrough on every event |
| `{{Quoted value}}` | `value` | `sale.recorded` |
| `{{Marketing consent}}` | `consent_state` (`granted` / `withdrawn` / `policy_updated`) | `consent.*` events |

Missing optional variables are omitted from events entirely — never sent as empty strings.

## Use 1 — copy-paste Code step (works today)

Typebot cannot load third-party npm blocks yet, but its **Code step** runs arbitrary JavaScript. Paste a tiny shim plus the bundled logic:

1. In your Typebot flow, add a **Code step** where you want an event tracked.
2. Set the code below, replacing the variable references with your flow's variables.
3. Repeat per action, or keep one block instance in scope across steps.

```js
// Code step: Identify Visitor/Lead -> event 'lead'
const res = await fetch('https://YOUR-SITE.com/api/clicktrail', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    // 'X-ClickTrail-Key': 'OPTIONAL_KEY',
  },
  body: JSON.stringify({
    events: [{
      schema_version: 1,
      event_name: 'lead',
      occurred_at: new Date().toISOString(),
      site_id: 'YOUR_SITE_ID',
      email: {{Email}},
      phone: {{Phone}},
      campaign: {{utm_campaign}},
      gclid: {{gclid}},
    }],
  }),
});
// Analytics failures never break the chat: fetch errors are swallowed by
// wrapping this in try/catch if you use it inside custom JS execution.
```

For the full programmatic API (eight actions, payload merging, consent normalization, injected clock/fetch for testing) install the package in your own tooling:

```ts
import { createClickTrailBlock } from '@vizuh/clicktrail-typebot';

const block = createClickTrailBlock({
  endpoint: '/api/clicktrail', // relative = same-origin first-party proxy
  siteId: 'site_123',
  // apiKey: '...',           // sent as X-ClickTrail-Key header
  debug: false,
});

block.attachVariables({ utm_campaign: {{utm_campaign}}, gclid: {{gclid}} }); // action 8
await block.identifyVisitor({ Email: {{Email}}, Phone: {{Phone}} });         // action 1 -> 'lead'
await block.trackFormStarted();                                              // action 2 -> 'form.started'
await block.trackLeadSubmitted({ Email: {{Email}} });                        // action 3 -> 'form.submitted'
await block.trackQualifiedLead({ 'Lead ID': {{'Lead ID'}} });                // action 4 -> 'lead.qualified'
await block.trackAppointmentRequested();                                     // action 5 -> 'appointment.requested'
await block.trackPurchase({                                                  // action 6 -> 'sale.recorded'
  transactionId: {{Transaction ID}}, value: {{Quoted value}}, currency: 'EUR',
});
await block.updateConsent('granted');                                        // action 7 -> 'consent.granted'
```

### The eight actions

| # | Action | Event name | Required fields |
|---|---|---|---|
| 1 | Identify Visitor/Lead | `lead` | — |
| 2 | Track Form Started | `form.started` | — |
| 3 | Track Lead Submitted | `form.submitted` | — |
| 4 | Track Qualified Lead | `lead.qualified` | `lead_id` |
| 5 | Track Appointment Requested | `appointment.requested` | — |
| 6 | Track Purchase | `sale.recorded` | `transaction_id`, `value`, `currency` |
| 7 | Update Consent | `consent.granted` / `consent.withdrawn` / `consent.policy_updated` | state |
| 8 | Attach Variables as Properties | *(no event; merges onto current visitor payload)* | — |

Action 8 is pure attribution passthrough: `utm_campaign` maps onto the `campaign` field, `gclid` onto the gclid click id, and any arbitrary extra properties JSON input is merged under `properties`. Subsequent events carry the merged fields.

## Use 2 — upstream PR path

Official Typebot blocks live in the typebot monorepo (`packages/blocks/*`) built on `@typebot.io/lib` + `@typebot.io/schemas`. Third parties can't publish standalone blocks today: contributors open an issue first, then PR the block. See [`UPSTREAM-ISSUE-DRAFT.md`](./UPSTREAM-ISSUE-DRAFT.md) — a ready-to-post proposal whose options schema mirrors `src/config.ts` and the mapping table above.

When the block is accepted upstream, the only changes are mechanical: swap the plain config object for `option` helpers (`option.string`, `option.optional`, ...) and register the typed block schema. The builders in `src/events.ts` are already pure functions of `(mappedVariables, config)` with all effects (send fn, clock) injected, which matches how typebot blocks execute their custom actions.

## Configuration

```ts
interface TypebotBlockConfig {
  endpoint?: string;     // default '/api/clicktrail' (relative or absolute http(s))
  siteId?: string;
  workspaceId?: string;
  apiKey?: string;       // X-ClickTrail-Key header
  debug?: boolean;       // log send outcomes through deps.log
}
```

## Development

```sh
pnpm install --filter @vizuh/clicktrail-typebot
pnpm --filter @vizuh/clicktrail-typebot build   # tsc -p tsconfig.build.json
pnpm --filter @vizuh/clicktrail-typebot test    # vitest
pnpm --filter @vizuh/clicktrail-typebot exec tsc -p tsconfig.json --noEmit
```

MIT © Vizuh OÜ
