# Static page demo (IIFE global bundle)

Single-file HTML demo. No build, no install, no bundler: it loads the built
IIFE bundle (`clicktrail.global.js`, copied here from
`packages/clicktrail/dist/clicktrail.global.js`) which exposes a
`window.ClickTrail` namespace — `createClickTrail`, the destinations,
storage/forms helpers, and the pure `parseAttributionUrl`.

What you learn:

- how to wire ClickTrail into any plain HTML page with zero tooling;
- how the dataLayer destination pushes canonical events into a host-owned
  `window.dataLayer` array (the same bridge GTM consumes);
- how consent maps to the instance lifecycle (`start()` / `stop()`), and that
  nothing happens before `start()`.

## Run

Option A — open directly:

```
open examples/static-page/index.html   # or just double-click it
```

Option B — serve it (needed for cookies; attribution storage is cookie-based,
so consented tracking only persists on http(s), not on `file://`):

```bash
npx serve examples/static-page
# then visit the printed URL, e.g. http://localhost:3000
```

Tip: append UTMs to see first-touch capture, e.g.
`http://localhost:3000/?utm_source=google&utm_medium=cpc&utm_campaign=demo&gclid=TEST123`,
reload once without them, and fire the demo event — `ft_*` is preserved while
the envelope carries the latest touch.

## What to look for

1. **Consent checkbox** → checked calls `clickTrail.start()`, unchecked calls
   `clickTrail.stop()`. Before start, the SDK has zero side effects.
2. **Demo button** → pushes a `lead_created` event into
   `window.dataLayer`; the latest push renders below the button.
3. Each push keeps canonical fields flat for tag-manager variables and adds a
   `marketing_trail` envelope (`event_name`, `trail_id`, `click_ids`,
   consent, form context) plus `schema_version` / `classifier_version`
   stamps and an `event_id` for deduplication wiring.
4. The console logs what `parseAttributionUrl` classified for this landing
   URL — the pure core runs in the same page with no module system.
