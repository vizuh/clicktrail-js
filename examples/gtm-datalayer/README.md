# GTM dataLayer bridge — copy-only recipe

How to feed ClickTrail events into Google Tag Manager using the
`dataLayerDestination()` from `@vizuh/clicktrail/browser`. No code files here:
copy the snippets into your site's integration layer.

## 1. Host-owned dataLayer + destination

Declare the array yourself, then pass it in. ClickTrail never creates or
replaces your GTM container:

```ts
window.dataLayer = window.dataLayer || [];

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination({ dataLayer: window.dataLayer })],
  consentGate: () => hasMarketingConsent(), // your consent source
  storage: { cookieAttrs: { path: '/', sameSite: 'Lax', secure: true } },
});

clickTrail.start();
```

## 2. Push shape

Every delivered event is one flat object pushed onto the array. Canonical
fields stay flat so each maps directly to a GTM data-layer variable; a
`marketing_trail` envelope carries the normalized view; the SDK also copies
`event_name` into `event`, which is the key GTM treats as the custom-event
name:

```
{
  "event": "lead_created",          // GTM custom-event key
  "event_name": "lead_created",
  "event_id": "evt_...",              // deduplication wiring
  "schema_version": "1.2.0",
  "classifier_version": "1.2.0",
  // flat canonical fields (same keys the WP plugin uses):
  "ft_source": "google", "lt_source": "google",
  "ft_medium": "cpc",   "lt_medium": "cpc",
  "ft_campaign": "...", "lt_campaign": "...",
  "gclid": "...",
  // normalized envelope:
  "marketing_trail": {
    "event_id": "evt_...",
    "trail_id": "trl_...",
    "anonymous_id": "anon_...",
    "lead_id": "lead_...",
    "workspace_id": "ws_...", "site_id": "...",
    "event_name": "lead_created",
    "occurred_at": "2026-08-24T10:00:00.000Z",
    "landing_page": "https://...",
    "referrer": "https://www.google.com/",
    "source": "google", "medium": "cpc", "campaign": "...",
    "click_ids": { "gclid": "..." },
    "consent": { "analytics": true, "advertising": true },
    "form": { "provider": "", "form_id": "" }
  }
}
```

## 3. Data-layer variables to create in GTM

| GTM variable | Data-layer variable name | Type |
|---|---|---|
| CT Event Name | `event_name` | Data Layer Variable |
| CT Trail ID | `marketing_trail.trail_id` | Data Layer Variable |
| CT First-Touch Source | `ft_source` | Data Layer Variable |
| CT Last-Touch Source | `lt_source` | Data Layer Variable |
| CT First-Touch Medium | `ft_medium` | Data Layer Variable |
| CT Last-Touch Medium | `lt_medium` | Data Layer Variable |
| CT gclid | `marketing_trail.click_ids.gclid` | Data Layer Variable |

Notes:

- Use `marketing_trail.source` / `marketing_trail.medium` when you want
  latest-touch with first-touch fallback in one place.
- `event_id` exists for server-side/conversion deduplication; keep one value
  per event across tags.

## 4. Suggested trigger config

1. **Trigger type:** Custom Event.
2. **Event name:** `.*` with "Use regex matching" checked to fire on every
   ClickTrail push, or list explicit names (`lead_created`, plus any custom
   `track()` names you use) for tighter control.
3. **This trigger fires on:** some Custom Events — add conditions such as
   `CT Event Name` matches RegEx `^(lead_created|page_view)$` if you only
   want conversions downstream.
4. Attach your conversion/pixel tags to this trigger and pass the variables
   from step 3. For Google Ads conversions, map `marketing_trail.click_ids.gclid`
   into the conversion tag's click ID field and forward `event_id` for
   deduplication.

## 5. Consent

The destination only delivers after `start()`, and the consent gate blocks
capture attempts while denied. Mirror the granted/denied state in your CMP;
test granted, denied, and withdrawn paths before shipping.

> **Warning — never route PII into metadata fields.**
> Do not put names, emails, phone numbers, addresses, message content, or any
> other personal data into `track()` data, form metadata, or the
> `marketing_trail` envelope. ClickTrail records attribution metadata only:
> IDs, sources, campaigns, consent state. The `/agent` and `/conversation`
> entry points drop content by design, and adding PII through the data bag
> bypasses that protection — sending personal data into tag managers and ad
> platforms creates GDPR/ePrivacy exposure you own. Keep identity resolution
> in systems built for it.

## Related

- Browser adapter docs: `packages/clicktrail/README.md`
- Tutorials (deterministic replay, forms, cross-domain): `docs/TUTORIALS.md`
- Runnable demo of the same destination: [`../static-page/`](../static-page/)
