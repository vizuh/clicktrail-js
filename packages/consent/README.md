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

## Google Consent Mode v2

`@vizuh/clicktrail-consent/google-consent-mode` passes the same decision to
Google tags. Nothing runs until you call it.

```ts
import { createConsentGate, createConsentHub } from '@vizuh/clicktrail-consent';
import {
  applyConsentModeUpdate,
  consentModeDefaultScript,
  loadConsentRecord,
  saveConsentRecord,
} from '@vizuh/clicktrail-consent/google-consent-mode';

const KEY = 'site:consent';

// Server/head: render this inline script BEFORE the GTM snippet
// (add your CSP nonce to the <script> element that wraps it).
const head = consentModeDefaultScript({ storageKey: KEY });

// Browser: store each decision and tell Google tags.
const hub = createConsentHub();
hub.subscribe((record) => {
  saveConsentRecord(KEY, record);
  applyConsentModeUpdate(record);
});

// Gate the SDK on the stored record. loadConsentRecord returns null while
// pending (no answer yet) and the stored record once denied, so the host can
// report pending vs denied (e.g. to its server). The gate blocks both.
const consentGate = createConsentGate(() => loadConsentRecord(KEY));
```

| `ConsentRecord` | `analytics_storage` | `ad_storage`, `ad_user_data`, `ad_personalization` |
| --- | --- | --- |
| none stored (pending) | denied (default only, no `update`) | denied |
| `analytics: true` | granted | denied |
| `analytics: true, advertising: true` | granted | granted |
| `state: 'denied'`, no flags | denied | denied |

- Purpose flags decide the signals, not `state`: CMP adapters set `state` from
  marketing, so analytics-only consent still grants `analytics_storage`.
  Advertising uses `advertising`, falling back to `marketing` when unset.
- The default script reads the JSON record written by `saveConsentRecord`,
  defines `dataLayer`/`gtag` if missing, and sets `wait_for_update: 500`
  (the WordPress plugin's value; `waitForUpdate: 0` omits it).
- `applyConsentModeUpdate` uses the page's `gtag` when present, otherwise
  pushes gtag's `arguments` object to `dataLayer`. It returns the signals it
  sent, or `null` for pending or without a `window` (SSR).
- Regional defaults and the non-ad storage types
  (`functionality_storage`, …) are left to the host.

## License

MIT — see [LICENSE](./LICENSE).
