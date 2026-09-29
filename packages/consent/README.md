# @vizuh/clicktrail-consent

Small consent contracts shared by ClickTrail integrations. They gate the
attribution handoff before storage or transmission.

This package does not provide a consent-management platform. Your CMP or
application owns the decision. These helpers give integrations one consistent
way to represent that decision and gate storage or transmission.

## Install

```sh
npm install @vizuh/clicktrail-consent
```

The package is ESM-only and requires Node.js 18 or later.

## Example

```ts
import {
  createConsentGate,
  transmissionAllowed,
} from '@vizuh/clicktrail-consent';

const snapshot = () => ({
  state: 'granted' as const,
  analytics: true,
  advertising: false,
  source: 'site-cmp',
});

const canTrack = createConsentGate(snapshot);
const canSend = transmissionAllowed(snapshot, 'analytics');
```

Unknown or denied consent does not allow storage or transmission. Revoke or
clear data through the host integration when consent is withdrawn.

## CMP adapters

`@vizuh/clicktrail-consent/cmp` connects common consent-management platforms to
a `ConsentHub`. Adapters only read the CMP's decision; they never render a
banner or decide consent.

```ts
import { createConsentHub } from '@vizuh/clicktrail-consent';
import { connectCookiebot } from '@vizuh/clicktrail-consent/cmp';

const hub = createConsentHub();
const disconnect = connectCookiebot(hub);
hub.subscribe((record) => {
  // Capture on grant (read the click ID from the current URL); clear on denial.
});
```

| Adapter | Reads | Listens to |
| --- | --- | --- |
| `connectCookiebot` | `Cookiebot.hasResponse`, `Cookiebot.consent.marketing` / `statistics` | `CookiebotOnConsentReady`, `CookiebotOnAccept`, `CookiebotOnDecline` |
| `connectOneTrust` | `OnetrustActiveGroups` (exact group match; `marketingGroup` default `C0004`, `analyticsGroup` default `C0002`) | `OneTrustGroupsUpdated`, plus a wrapped `OptanonWrapper` (host function kept) |
| `connectComplianz` | `cmplz_has_consent('marketing' / 'statistics')`, else `event.detail.categories` | `cmplz_fire_categories`, `cmplz_status_change` |

Ordering contract:

- Adapters emit the CMP's effective decision, the same state the CMP uses for
  its own tags. Cookiebot emits nothing until `hasResponse`. OneTrust and
  Complianz report their current state: with an opt-in banner that is `denied`
  until the visitor accepts; in an opt-out/implied-consent region configured in
  the CMP it can be `granted` before any click. Persist nothing before a grant.
- Some CMPs (Cookiebot) delete unclassified storage before firing their events.
  Capture on the emitted grant and read the click ID from the current URL, not
  from storage written before the decision.
- `state` follows marketing consent, because `storageAllowed()` checks only
  `state`: analytics-only consent does not unlock attribution storage.
- Adapters stay subscribed, so in-page withdrawals emit `denied`; clear stored
  attribution in your subscriber.

These semantics match the ClickTrail WordPress plugin's consent bridge. The
adapters are browser-only; without a `window` (SSR) they return a no-op
disposer. Pass `{ target }` to supply a window-like object in tests.

## License

MIT — see [LICENSE](./LICENSE).
