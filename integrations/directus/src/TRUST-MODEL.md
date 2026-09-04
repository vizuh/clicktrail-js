# Trust Model — directus-extension-clicktrail

## Why these components run where they run

Directus extensions split along a hard boundary: **API-side** code runs inside
the Directus Node.js server; **app-side** code runs in the administrator's
browser as part of the Admin App bundle.

| Component | Side | Why |
|---|---|---|
| Flow operation (`clicktrail-send-event`) | API | Must make an outbound HTTP POST to the ClickTrail collector. Browsers cannot do this without CORS exposure and key leakage. |
| Attribution hook (`items.create`) | API | Reads raw item payloads at write time and forwards attribution events. Same network-egress requirement. |
| Funnel panel (`Campaign → Lead → Sale`) | App (dashboard) | Pure visualization over stored `clicktrail_events` rows. No egress beyond the Directus API itself. |
| Settings module (`ClickTrail Settings`) | App (dashboard) | Form only. Emits `save`; the host performs persistence through the authenticated Directus API. |

The rule: **anything that needs network egress or env-var access is API-side;
anything that only renders data the admin already has access to stays app-side
and inherits the app's own authentication.**

## What an administrator grants by installing this package

1. **Server process egress.** The operation and hook POST `{ events: [...] }`
   to the endpoint configured via `CLICKTRAIL_ENDPOINT` (or per-operation
   `endpoint` config). Nothing else leaves the server.
2. **Env-var reads.** `CLICKTRAIL_SITE_ID`, `CLICKTRAIL_ENDPOINT`,
   `CLICKTRAIL_API_KEY`, `CLICKTRAIL_STORE_LOCALLY`. The package never writes
   env vars and never logs their values.
3. **Items reads on configured collections.** The hook inspects item payloads
   for attribution signals (ft_/lt_ keys, utm_*, click ids, visitor/trail/
   session ids, landing_url/referrer). Default: `leads`, `bookings`, `orders`.
   Override with the hook's `collections` option.
4. **One optional local write.** When `CLICKTRAIL_STORE_LOCALLY=true`, each
   forwarded event is inserted into the `clicktrail_events` collection.

## Least-trust guidance

- Scope env vars to exactly the four above; no shared credentials.
- The collector API key lives only in env (`CLICKTRAIL_API_KEY`) or per-flow
  operation config — never in dashboard state. The env key is used only with
  the env-configured endpoint; a per-flow endpoint must provide its own key or
  sends without one. The settings module stores a **masked** display value
  (`ab…yz`) only.
- Prefer `CLICKTRAIL_STORE_LOCALLY=true` when possible: the panel then reads
  locally and no dashboard surface needs external network at all.
- Restrict read access to `clicktrail_events` to roles that may see lead
  attribution data.

## Sandboxing tradeoff (stated head-on)

Directus 11 supports sandboxed extensions, which require pre-declaring scopes
(e.g. fixed network URLs). This extension ships with `"sandbox": { "enabled":
false }` in v1 because its primary job is posting to a **customer-configured**
collector URL that cannot be known at publish time, plus optional ItemsService
writes. A sandboxed build would have to hard-code one collector domain, which
would break self-hosted collectors. If you need the sandbox, fork with your
fixed endpoint and declare `requestedScopes.network` accordingly — the code
has no other side effects.

## No browser-injection JavaScript ships in v1

This package is **server + dashboard only**. It contains zero page-tagging,
snippet-injection, or visitor-facing script. Visitor-side tracking belongs to
the separate browser SDK packages (`@vizuh/clicktrail`, site integration).
Nothing in this package executes in end-user browsers — only in the Directus
Admin App for logged-in administrators.

## Failure containment

Both API pieces are log-and-return: any failure (bad config, bad JSON,
network outage) is caught, optionally logged, and converted into a result
(`{ ok: false, status }`) or a silently-skipped event. An analytics outage
can never fail a customer's Flow or block a collection write.
