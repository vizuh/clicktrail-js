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

## 2. Push shape (`datalayer_version` 2.0.0)

Every delivered event is one flat object pushed onto the array. Canonical
fields stay flat so each maps directly to a GTM data-layer variable; a
`marketing_trail` envelope carries the normalized view; the SDK also copies
`event_name` into `event`, which is the key GTM treats as the custom-event
name. Two exceptions keep the push from colliding with the Google tag:

- Flat keys that the Google tag reads as its own fields are prefixed with
  `ct_` (see [§3](#3-reserved-google-tag-fields)): `session_id` is pushed as
  `ct_session_id`, `session_number` as `ct_session_number`, and so on.
- The canonical `page_view` is pushed with `event: "ct_page_view"`.
  `event_name` and `marketing_trail.event_name` stay `"page_view"`.

```
{
  "event": "lead_submitted",          // GTM custom-event key
  "event_name": "lead_submitted",
  "event_id": "evt_...",              // deduplication wiring
  "schema_version": "1.2.0",
  "classifier_version": "1.2.0",
  "datalayer_version": "2.0.0",       // version of this push shape
  // flat canonical fields (same keys the WP plugin uses):
  "ft_source": "google", "lt_source": "google",
  "ft_medium": "cpc",   "lt_medium": "cpc",
  "ft_campaign": "...", "lt_campaign": "...",
  "gclid": "...",
  "visitor_id": "...",
  // Google tag field names, prefixed:
  "ct_session_id": "...", "ct_session_number": "...",
  // normalized envelope (never renamed):
  "marketing_trail": {
    "event_id": "evt_...",
    "trail_id": "trl_...",
    "anonymous_id": "anon_...",
    "lead_id": "lead_...",
    "workspace_id": "ws_...", "site_id": "...",
    "event_name": "lead_submitted",
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

Both exceptions are configurable:

```ts
dataLayerDestination({
  dataLayer: window.dataLayer,
  reservedFieldPrefix: 'ct_',     // default; must not be empty
  pageViewEvent: 'ct_page_view',  // default GTM `event` for page_view
});
```

## 3. Reserved Google tag fields

The Google tag (gtag.js / GA4) treats these names as its own fields, not as
free event parameters. ClickTrail never pushes them flat; it pushes
`ct_<name>` instead (`GOOGLE_TAG_RESERVED_FIELDS` in
`@vizuh/clicktrail/browser`):

`session_id`, `client_id`, `user_id`, `session_number`,
`engagement_time_msec`, `timestamp_micros`, `page_location`, `page_referrer`.

Why it matters: a GA4 Event tag parameter named `session_id` is sent as GA4's
own session (`sid`), not as a custom parameter. On the tag's first hit it
overrides the `_ga_<property>` session cookie, so GA4 sees sessions without
`session_start`, traffic source `(not set)`, and conversions land in
Unassigned. The other names override their Google tag fields the same way;
for example a `page_location` parameter replaces the page URL of the hit.

When you add GA4 Event tag parameters:

- Map ClickTrail identity under a custom name, for example
  `ct_session_id → {{CT Session ID}}`. Never use a reserved name as the
  parameter name, whatever its value.
- Map `ct_user_id` to GA4's **User ID** field only if it really is your
  logged-in user ID; otherwise leave it as a custom parameter.

## 4. Data-layer variables to create in GTM

| GTM variable | Data-layer variable name | Type |
|---|---|---|
| CT Event Name | `event_name` | Data Layer Variable |
| CT Trail ID | `marketing_trail.trail_id` | Data Layer Variable |
| CT Session ID | `ct_session_id` | Data Layer Variable |
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

## 5. Suggested trigger config

1. **Trigger type:** Custom Event.
2. **Event name:** list explicit names (`lead_submitted`, plus any custom
   `track()` names you use). A `.*` regex fires on every ClickTrail push
   **and** every other dataLayer event; use it only with the exclusions
   below.
3. **This trigger fires on:** some Custom Events — add conditions such as
   `{{Event}}` matches RegEx `^(lead_submitted|ct_page_view)$` if you only
   want those pushes downstream.
4. Attach your conversion/pixel tags to this trigger and pass the variables
   from step 4. For Google Ads conversions, map `marketing_trail.click_ids.gclid`
   into the conversion tag's click ID field and forward `event_id` for
   deduplication.

### Catch-all GA4 Event tags

A common setup is one GA4 Event tag with event name `{{Event}}` on a trigger
that fires for every custom event except `gtm.*`. With ClickTrail on the page:

- Also exclude `ct_page_view` (`{{Event}}` does not match RegEx
  `^(gtm\..*|ct_page_view)$`). The Google tag already sends its own
  `page_view`, including history-change page views in SPAs; forwarding
  ClickTrail's page view as well counts every navigation more than once.
- Use `{{Event}}` as the GA4 event name, not `{{CT Event Name}}`:
  `event_name` stays `page_view` for the canonical page view.
- Do not add a parameter whose name is in [§3](#3-reserved-google-tag-fields).

## 6. Consent

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
