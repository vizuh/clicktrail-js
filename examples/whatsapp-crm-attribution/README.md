# WhatsApp → CRM attribution handoff

A copy-only recipe for the boundary where a visitor leaves the browser and a
human creates or updates a CRM lead after a WhatsApp conversation.

```text
landing + consent
      ↓
ClickTrail first-party attribution cookie
      ↓
application-owned handoff endpoint
      ↓
opaque CT-* code (short-lived)
      ↓
wa.me link / prefilled message
      ↓
manual CRM lead entry
      ↓
first-write-only attribution_id
      ↓
signed contract → stable ClickTrail event ID
```

This example does **not** become a CRM, WhatsApp client, identity provider, or
ad-platform integration. The host owns consent, authentication, storage,
retention, access control, deduplication, CRM writes, retries, and provider
configuration.

## Run the tests

```bash
node --test examples/whatsapp-crm-attribution/index.test.mjs
```

The tests use an in-memory store and a fake collector. They do not call
WhatsApp, a CRM, a provider, or an external endpoint.

## 1. Browser boundary

Start ClickTrail only from the host's consent callback. The helper asks the
application endpoint for a code but sends no attribution payload:

```js
import { createClickTrail } from '@vizuh/clicktrail-browser';
import { createWhatsAppLink } from './browser.mjs';

const clicktrail = createClickTrail({
  destinations: [],
  consentGate: () => cmp.get('marketing') === true,
  consentState: () => ({
    marketing: cmp.get('marketing') === true,
    advertising: cmp.get('advertising') === true,
  }),
  storage: { cookieAttrs: { path: '/', sameSite: 'Lax', secure: true } },
});

// Call after the CMP grants marketing/advertising consent and after start().
const result = await createWhatsAppLink({
  clicktrail,
  consentState: { marketing: true, advertising: true },
  endpoint: '/api/whatsapp-handoff',
  phone: '+351912345678',
  message: 'Olá! Tenho interesse e gostaria de saber mais.',
});
window.location.assign(result.url);
```

If consent is missing or the endpoint is unavailable, the helper returns a
direct WhatsApp link with no code. A missing or edited code therefore becomes
an unattributed lead; do not infer attribution from the phone number or message
text.

The endpoint request body is only:

```json
{"destination":"whatsapp"}
```

Use a same-origin relative endpoint. Absolute URLs are accepted only when they
match the browser's current origin; this example does not define cross-origin
credentials or CORS behavior for the ClickTrail cookie.

## 2. Create the handoff on the server

Use the server adapter to read the first-party cookie. Do not accept an
attribution payload or consent claim from request JSON. Read the current CMP
state from the host's trusted consent boundary:

```js
import { parseIdentityFromCookies } from '@vizuh/clicktrail-server';
import { createHandoff } from './create-handoff.mjs';

export async function POST(request) {
  const identity = parseIdentityFromCookies(request.headers.get('cookie'));
  const consentState = await hostConsentState(request); // host-owned
  const result = await createHandoff(
    {
      identity,
      consentState,
      destination: 'whatsapp',
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    },
    handoffStore,
  );
  return Response.json(result, { status: result.status === 'created' ? 200 : 403 });
}
```

`handoffStore` needs two host-owned methods:

```ts
put(record: {
  version: 1;
  id: string;
  codeHash: string;
  destination: 'whatsapp';
  createdAt: string;
  expiresAt: string;
  consent: { analytics: boolean; advertising: boolean; marketing: boolean };
  identity: { payload: Record<string, string>; visitorId?: string; sessionId?: string; sessionNumber?: number };
}): Promise<void>;
getByCodeHash(codeHash: string): Promise<typeof record | null>;
putById(record: {
  version: 1;
  kind: 'contract_snapshot';
  id: string;
  destination: 'whatsapp';
  leadId: string;
  createdAt: string;
  codeExpiresAt: string;
  retainedAt: string;
  retainedUntil: string;
  consent: { analytics: boolean; advertising: boolean; marketing: boolean };
  identity: { payload: Record<string, string>; visitorId?: string; sessionId?: string; sessionNumber?: number };
}): Promise<void>;
getById(id: string): Promise<typeof record | null>;
```

The store receives a SHA-256 code hash, never the plaintext `CT-*` code. Add
expiry cleanup for code records, tenant scoping, encryption, access control,
CSRF/origin checks, and rate limiting in the host. `putById` must be
insert-if-absent or reject conflicting replacements. Keep the separate
`contract_snapshot` record until the business-approved contract attribution
horizon; the seven-day code TTL is not that retention horizon.

The snapshot is first-touch context at handoff creation. It can contain Google
IDs, Meta IDs, UTMs, and the ClickTrail landing page because it is held behind
consent in the host store. None of those values are placed in the WhatsApp URL,
message, or CRM field.

## 3. Resolve during manual CRM entry

Extract the code from the message or the operator's entry, then resolve it:

```js
import { extractHandoffCode } from './whatsapp-link.mjs';
import { resolveHandoff } from './resolve-handoff.mjs';
import { attachHandoffToLead, retainHandoffForContract } from './crm-lead.mjs';

const code = extractHandoffCode(operatorNote);
const handoff = await resolveHandoff({ code }, handoffStore);
const attached = attachHandoffToLead(lead, handoff);
// Persist this in the same transaction as the CRM write, or use an equivalent
// durable outbox. The contract job must not depend on the seven-day code row.
if (attached.status === 'attached') {
  await retainHandoffForContract(
    { handoff, leadId: lead.id, now: new Date() },
    handoffStore,
  );
}
await crm.createOrUpdateLead(attached.lead);
```

Resolution is idempotent and does not consume the record, so CRM retries can
resolve the same snapshot. An expired, invalid, removed, or mismatched code
returns no handoff. A returning contact with an existing `attribution_id` keeps
that existing value; the host decides whether to flag the conflict for review.
The CRM field receives the durable `hnd_*` ID, not the reusable bearer code.
Retain the resolved snapshot under that ID for the approved contract horizon;
code expiry and contract-snapshot retention are separate policies. Do not use
either value as authentication or identity proof.

## 4. Record a signed contract

Keep the CRM and contract tables as the business source of truth. When a
contract is actually signed, reuse one stable event ID on every retry:

```js
import { ClickTrailServer } from '@vizuh/clicktrail-server';
import { recordSignedContract } from './conversion.mjs';

const server = new ClickTrailServer({
  endpoint: process.env.CLICKTRAIL_COLLECTOR_URL,
  siteId: 'site-example',
});

const result = await recordSignedContract({
  server,
  handoffId: lead.attribution_id,
  handoffStore,
  contract: {
    id: contract.id,
    status: 'signed',
    signedAt: contract.signedAt, // reuse this exact value on every retry
    value: contract.total,
    currency: contract.currency,
  },
});
```

The contract job resolves the durable snapshot by `hnd_*`; it does not need the
expired WhatsApp code or an in-memory `handoff` variable. `signedAt` is required
and is passed as ClickTrail's `now` value on every retry, so the occurrence time
does not drift when delivery is delayed.

The event ID is a stable hash-derived `evt_contract_*` value. The event is a
provider-neutral ClickTrail collector event. A successful collector response
is not proof that Google Ads, Meta, or another provider accepted a conversion;
verify that separately with an independent receipt.

## Failure rules

- **No consent:** do not create a handoff; direct WhatsApp links may still work
  without attribution.
- **Code removed:** create the lead without `attribution_id`; never guess from
  a phone number, name, or conversation text.
- **Expired code:** return `null` and keep the lead unattributed. A previously
  retained contract snapshot may still be resolved by `hnd_*` until its
  separately configured retention deadline.
- **Duplicate or returning contact:** preserve a non-empty existing
  `attribution_id`; surface conflicts for host review.
- **Google and Meta identifiers:** keep both in the immutable ClickTrail
  snapshot when present; do not choose one by guesswork.
- **Collector failure:** preserve the signed-contract event ID and retry under
  host policy; do not claim provider acceptance from an HTTP response alone.
