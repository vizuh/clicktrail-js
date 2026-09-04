# ClickTrail JS Tutorials

These examples use caller-owned clocks, storage, consent, and destinations.
They are integration starting points, not provider-delivery certification.

## Deterministic replay

Use the stable entry point when a server, worker, or test needs to classify a
known URL without browser effects:

```ts
import {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
  stampVersions,
} from '@vizuh/clicktrail';

const result = parseAttributionUrl({
  url: 'https://example.com/?utm_source=google&utm_medium=cpc&gclid=test',
  referrer: 'https://www.google.com/',
  currentHost: 'example.com',
  now: '2026-08-24T10:00:00.000Z',
});

if (result.kind === 'touch') {
  const payload = stampVersions(
    mergeAttributionTouch(emptyAttribution(), result.touch),
  );
  console.log(payload.ft_source, payload.ft_medium);
}
```

The core does not read time, storage, `window`, or the network. That makes the
same fixture replayable in an application and in CI.

## Browser capture with forms

Use the browser entry point when the host owns the page, consent decision, and
first-party storage:

```ts
import {
  createClickTrail,
  dataLayerDestination,
} from '@vizuh/clicktrail/browser';

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => hasMarketingConsent(),
  storage: {
    cookieAttrs: { path: '/', sameSite: 'Lax', secure: true },
  },
  forms: {},
});

clickTrail.start();
```

Test the integration with consent granted, denied, and withdrawn. Test a
cached page and a form added after page load. The resulting provider record is
separate evidence from a browser event.

### Executable WordPress-to-CRM reference

Run `pnpm probe` to exercise the complete synthetic reference fixture in a real
browser. It starts without consent, captures a Google Ads first touch after
consent, follows a cached WordPress-shaped page to an email last touch, injects
attribution into a late-added form, and sends the same canonical fields to a
customer-controlled CRM endpoint. Withdrawal then clears browser state and
blocks another conversion.

Fixture inputs and expected fields live in
[`probe/fixtures/wordpress-to-crm.json`](../probe/fixtures/wordpress-to-crm.json);
the Playwright runner is
[`probe/run-wordpress-reference.mjs`](../probe/run-wordpress-reference.mjs).
The CRM is a localhost assertion endpoint, not live WordPress or provider
delivery certification.

## Formbricks link-survey bridge

Use the optional Formbricks adapter when a survey is hosted outside the page
that owns ClickTrail. It decorates the survey URL with an explicit `ct_*`
allowlist, then maps only signed `responseFinished` webhooks into a ClickTrail
lead event.

```ts
import { decorateFormbricksSurveyUrl } from '@vizuh/clicktrail-formbricks';

const surveyUrl = decorateFormbricksSurveyUrl(
  'https://survey.example/s/demo',
  clickTrail.getData(),
);
```

Configure matching hidden fields in Formbricks, verify the raw webhook body
before parsing it, and keep response IDs as the stable external key. Do not
forward survey answers, contact details, visitor IDs, or session IDs through
the default mapping.

## GTM or analytics bridge

Pass an existing array when the host already owns `window.dataLayer`:

```ts
const dataLayer: unknown[] = [];
const destination = dataLayerDestination({ dataLayer });
```

Start the ClickTrail instance, then inspect the array in the host's test
environment. The bridge keeps canonical fields flat for GTM data-layer
variables, publishes both `event` (the GTM custom-event key) and `event_name`,
and carries `event_id` for deduplication wiring. ClickTrail does not inject
Meta, Google, TikTok, LinkedIn, Pinterest, or Reddit pixel SDKs.

## Approved cross-domain continuity

Enable `crossDomain` only for domains the same team controls. The default HMAC
signer requires persisted storage so the receiving origin can verify tokens.
Separate origins need shared provisioning or explicit matching `sign` and
`verify` functions. Test an approved destination and an unapproved destination
before enabling the path.

## Related package docs

- [package README](../packages/clicktrail/README.md)
- [architecture](ARCHITECTURE.md)
- [release-readiness review](internal/RELEASE-READINESS-REVIEW.md)
