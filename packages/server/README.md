# @vizuh/clicktrail-server

Server-side conversion helpers for ClickTrail.

The package reads the attribution and identity cookies supplied by the host,
builds canonical lead, booking, and purchase events, and sends them to a
collector. Analytics failures return `{ ok: false, status }` instead of
breaking the host request.

## Install

```sh
npm install @vizuh/clicktrail-server
```

The package is ESM-only and requires Node.js 18 or later.

## Example

```ts
import { ClickTrailServer, parseIdentityFromCookies } from '@vizuh/clicktrail-server';

const identity = parseIdentityFromCookies(request.headers.get('cookie'));
const clickTrail = new ClickTrailServer({
  endpoint: 'https://collector.example.com/v1/events',
  siteId: 'site_123',
});

const result = await clickTrail.trackLead({
  identity,
  data: { formId: 'contact' },
});

if (!result.ok) {
  console.warn('ClickTrail delivery was not accepted:', result.status);
}
```

## Tenant adapters and webhook deduplication

Use `createTenantAdapter` for a trusted server-side tenant boundary. The
tenant, site, adapter name, and adapter version come from server configuration;
incoming event data cannot replace them. Supply the provider's stable event ID
as `externalEventId` so retries produce the same `event_id`:

```ts
import { createTenantAdapter } from '@vizuh/clicktrail-server';

const adapter = createTenantAdapter({
  endpoint: process.env.CLICKTRAIL_ENDPOINT!,
  tenantId: 'med10x-tenant-1',
  siteId: 'site_123',
  adapterName: 'med10x',
  adapterVersion: '0.1.0',
});

await adapter.send({
  identity,
  eventName: 'lead',
  externalEventId: webhook.id,
  data: { properties: { status: 'new' } },
});
```

The adapter is a provider-neutral boundary, not a claim that MED10X field
mapping is complete. Keep one capture owner per conversion. The collector must
deduplicate repeated `event_id` values; the adapter does not hide a second
browser, WordPress, or webhook capture path.

The host owns authentication, retry policy, consent policy, and endpoint
availability. Validate conversion fields before calling the helper and never
send customer content as attribution metadata.

## License

MIT — see [LICENSE](./LICENSE).

Server delivery aborts after 3 seconds and resolves `{ ok: false, status: 0 }`.
The deadline also bounds injected fetch functions that ignore the abort signal;
such a function may continue its own work after the caller returns. Astro, Nuxt,
Qwik, SvelteKit, their collector proxies, Typebot, and Directus use the same
bounded transport. Proxy timeouts return 502; Typebot returns `TimeoutError`.
Activepieces uses its native 3-second request timeout; n8n keeps its configurable
10-second default. No automatic retries are added.
