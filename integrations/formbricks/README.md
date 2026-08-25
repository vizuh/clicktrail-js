# @vizuh/clicktrail-formbricks

Small, independent interoperability layer for Formbricks link surveys. It
does not embed Formbricks, import its SDK, or send data until the host calls
the exported functions.

## Workspace status

This adapter is currently part of the `clicktrail-js` workspace. Use the local
package until its npm publication passes the normal package release gates.

```sh
pnpm --filter @vizuh/clicktrail-formbricks build
```

After publication, install `@vizuh/clicktrail` and
`@vizuh/clicktrail-formbricks` and `@vizuh/clicktrail-server` from npm when you
need server-side webhook delivery.

## Pass attribution into a link survey

Create matching hidden fields in Formbricks using the names generated below.
The default allowlist excludes visitor, session, and trail identifiers.

```ts
import { createClickTrail } from '@vizuh/clicktrail/browser';
import { decorateFormbricksSurveyUrl } from '@vizuh/clicktrail-formbricks';

const clickTrail = createClickTrail({
  destinations: [],
  consentGate: () => hasMarketingConsent(),
});
clickTrail.start();

const surveyUrl = decorateFormbricksSurveyUrl(
  'https://survey.example/s/demo',
  clickTrail.getData(),
);
```

The generated fields use the `ct_` prefix, for example
`ct_ft_source` and `ct_ft_campaign`. Existing query parameters and URL
fragments are preserved. Raw advertising click IDs are opt-in through the
`fields` option rather than forwarded by default.

## Verify and map a webhook

Keep the raw request body for signature verification. Configure Formbricks to
send `responseFinished` to a server endpoint, then map only that event into a
ClickTrail lead. The response body is not forwarded wholesale.

```ts
import { ClickTrailServer } from '@vizuh/clicktrail-server';
import {
  parseFormbricksWebhook,
  toClickTrailLead,
} from '@vizuh/clicktrail-formbricks';
import { verifyFormbricksWebhookSignature } from '@vizuh/clicktrail-formbricks/webhook';

const rawBody = await request.text();
const headers = Object.fromEntries(request.headers.entries());
if (!verifyFormbricksWebhookSignature(rawBody, headers, process.env.FORMBRICKS_WEBHOOK_SECRET!)) {
  return new Response('invalid signature', { status: 401 });
}

const webhook = parseFormbricksWebhook(JSON.parse(rawBody));
const mapping = toClickTrailLead(webhook, { siteId: 'site_123' });
if (mapping) {
  const clickTrail = new ClickTrailServer({ endpoint: 'https://collector.example/events' });
  await clickTrail.trackLead(mapping);
}
```

`toClickTrailLead` returns `null` for `responseCreated` and
`responseUpdated`. Its `event_id` is stable for the Formbricks response and
event, so webhook redelivery can be treated as an idempotent retry by the
collector.

## Privacy and support boundary

- Configure only the fields needed for attribution.
- Raw advertising click IDs are opt-in; do not add email, phone, answers, raw
  URLs, session IDs, or visitor IDs to the field list.
- The adapter uses public Formbricks response and webhook contracts and has no
  Formbricks runtime dependency.
- Formbricks Cloud, self-hosted deployments, API versions, and webhook retry
  behavior remain Formbricks concerns. Test against the deployment you operate.

## Development

```sh
pnpm --filter @vizuh/clicktrail-formbricks build
pnpm --filter @vizuh/clicktrail-formbricks test
pnpm --filter @vizuh/clicktrail-formbricks exec tsc -p tsconfig.json --noEmit
```

MIT © Vizuh OÜ
