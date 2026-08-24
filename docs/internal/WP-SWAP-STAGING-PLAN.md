# WordPress Swap Staging Plan — plugin browser runtime -> clicktrail-js engine

Status: DRAFT, 2026-08-24. **EXECUTION REQUIRES HUGO APPROVAL. This document
authorizes nothing by existing.** It stages the swap of
`click-trail-handler`'s browser runtime (`assets/js/clicutcl-attribution.js`)
to the `@vizuh/clicktrail` engine, gated on:

- Hugo gate rulings D2/D3 shipped in clicktrail-js (done, 01ae20e)
- PROVENANCE-AUDIT.md blockers B1-B4 resolved (npm publish preconditions)

## 1. Backup (pre-swap, per site)

WordPress options (via wp-cli or a one-off admin export):

```
wp option get clicutcl_attribution_settings --format=json > backup/settings.json
wp option get clicutcl_server_side        --format=json > backup/server-side.json
wp option get clicutcl_consent_mode       --format=json > backup/consent-mode.json
wp option get clicutcl_dispatch_log       --format=json > backup/dispatch-log.json
wp option get clicutcl_last_error         --format=json > backup/last-error.json
wp db export backup/clicktrail-full.sql   # full safety net incl. plugin tables
```

Stored attribution state schema snapshot (client side — capture BEFORE any
flag flip, from a real browser session with consent granted):

| Store | Key | Shape |
|---|---|---|
| cookie | `attribution` (CONFIG.cookieName) | base64url(JSON of flat payload; legacy installs may hold `first_*`/`last_*` keys) |
| localStorage | `attribution` | same payload as JSON |
| sessionStorage | `attribution`, `ct_pending_v1` | payload / pending-capture `{v:1,params,...}` |
| cookies | `ct_session_id`, `ct_visitor_id`, `ct_session` | identity + 30-min session envelope |

Snapshot procedure: dump `document.cookie`, `localStorage['attribution']`,
`sessionStorage` keys, decode the base64url payload, and record the exact
key set per site. Keep backups until the full rollout + 30 days post-rollout
(token TTL).

## 2. Payload migration

Path: read stored payload -> `normalizeLegacyAliases()` ->
`hydrateStoredPayload()` on the new instance (create-clicktrail.ts:463).

- **Legacy aliases**: `first_*`/`last_*` keys fold into canonical
  `ft_*`/`lt_*` via `normalizeLegacyAliases` (payload-store.ts). Canonical
  non-empty values always win; alias keys are dropped after normalization.
  The plugin itself already normalizes these on read
  (ATTRIBUTION_KEY_ALIASES, attribution.js:48-59), so most live payloads
  are already canonical.
- **`ft_<cid>` / `lt_<cid>` mirrors**: preserved verbatim — both mirror
  families are members of `CANONICAL_PAYLOAD_KEYS` (payload-store.ts), so
  hydration adopts them and store round-trips keep them.
- **D3 audit keys on OLD payloads** (`click_id_history`,
  `attribution_selected_click_id`, `attribution_selected_click_id_reason`):
  absent on legacy payloads. `emptyAttribution()` initializes them
  (`click_id_history = '[]'`, selection keys `''`) at SDK construction;
  history starts FRESH from first v2 pageview. No backfill.
- Unknown/foreign keys are dropped by hydration (canonical allowlist only).
- Migration runs lazily on the FIRST v2 pageview per visitor; no batch
  migration job exists or is needed.

## 3. Compatibility adapter — surface parity checklist

`window.ClickTrail` parity (plugin API.install, attribution.js:932-948 vs
browser/global-adapter.ts):

| Member | Plugin v1 | New adapter | Action |
|---|---|---|---|
| `getData()` | flat payload object | flat payload (defensive copy) | OK |
| `getField(key)` | string or `""` | string or `""` | OK |
| `clearData()` | clears store + session + re-install API | clears stored attribution state | OK |
| `getSession()` | SessionManager payload | SessionSnapshot | verify field names match (`session_id`,`session_number`,`visitor_id`) |
| `getEncoded()` | base64url of payload (:937-940) | MISSING | GAP: add to legacy adapter or confirm zero downstream consumers before cutover |
| `window.ClickTrailIdentity` / `ClickTrailSession` globals | set (:949-950) | not set | add if any site consumes them |
| `ct_ready` DOM event | dispatched (:956) | not emitted | add during Phase 2 wiring if consumed |
| form hidden fields | `ct_*` names | same naming (form-injection.ts) | OK |

dataLayer event shape diff (plugin push, attribution.js:1724-1732 and
clicutcl-events.js, vs engine dataLayer destination):

| Field | Plugin event(s) | Engine event |
|---|---|---|
| event name | `ct_page_view` (+ events.js allowlisted names) | caller-supplied `event_name` (default page-view name set in WP integration layer) |
| attribution | nested `ct_attribution` object | FLAT: every canonical key spread at top level |
| ids | `event_id`, `session_id`, `session_number`, `visitor_id` | `visitor_id`, `session_id`, `session_number` in payload; `event_time` replaces `event_id` |
| versions | none | `schema_version` + `classifier_version` ALWAYS present |

Action: GTM containers reading `ct_attribution` must migrate to flat reads,
OR the adapter emits both shapes during the shadow window. Decide per-site
during staging step 9.

## 4. Feature flag

Plugin-side setting `clicutcl_engine` inside the existing
`clicutcl_attribution_settings` option array:

- values: `'v1'` (default — existing JS runtime) | `'v2'` (clicktrail-js IIFE bundle)
- default `v1`; per-site override via filter
  (`apply_filters('clicutcl_engine', ...)`) plus an advanced-settings toggle
- enqueue branch in the plugin's script-registration path; v2 bundle served
  from the plugin `dist/` directory, built from clicktrail-js
  (`build:global` -> `dist/clicktrail.global.js`)
- flag is read once per request server-side; no runtime hot-flip required
  (rollback = flip + cache purge)

## 5. Shadow comparison (>= 7 days)

Run BOTH engines simultaneously on the same traffic: v2 executes after v1
in the page, reads the SAME stored payload, computes its own merge result
IN MEMORY ONLY (no writes, no outbound events except the diagnostic log),
and logs divergences.

Divergence log record (server endpoint or queued beacon, redacted):

```json
{
  "site": "<site slug>",
  "ts": "<ISO-8601 ms>",
  "classifier_version_v2": "1.1.0",
  "field": "lt_channel",
  "v1_value": "Facebook Organic",
  "v2_value": "Facebook",
  "rule": "D2-certainty-tier",
  "url_class": "utm|click-id|referrer|none"
}
```

Fields: site, timestamp, classifier_version (KEYED — every divergence is
attributable to the exact classifier build), payload field, both values, a
short rule tag mapping to a known ruling/deviation (expected diffs:
rulings #1/#2/#6/#7/#10/#14 + D2/D3), URL signal class. Expected standing
divergences are pre-registered; anything OUTSIDE that list blocks rollout.

## 6. Rollback procedure

1. Flip `clicutcl_engine` back to `'v1'` (per-site or network default).
2. Purge page cache/CDN so v1 script re-enqueues.
3. Verify with a live session: payload loads, `window.ClickTrail.getData()`
   responds, new touches write.

Storage compatibility guarantees REQUIRED before canary (verify each with a
fixture test, then document here):

- v2 writes the SAME cookie/localStorage keys with the SAME encoding
  (base64url JSON under `attribution`) — v1 must load them unchanged.
- New keys v1 IGNORES SAFELY (verified against v1 sanitize/store paths):
  `click_id_history` (string, kept as opaque value through v1 round-trip),
  `attribution_selected_click_id`, `attribution_selected_click_id_reason`.
  v1's store does not whitelist-read keys it does not know; unknown string
  keys survive its save because it persists the whole stored object.
  VERIFY THIS CLAIM with the runtime harness before canary — it is the
  single rollback-critical behavior.
- v2 must never write keys v1 would REJECT destructively (none known).
- If verification fails: v2 mode must be restricted to sites where rollback
  to v1 accepts payload loss, or v2 writes must be dual-keyed.

## 7. Telemetry

- Every outbound event carries `schema_version` + `classifier_version`
  (stampVersions) — add explicit `engine_version` (= package version) in
  the WP integration destination so support can attribute anomalies to a
  binary.
- Error/diagnostic counters (opt-in diagnostics lane): consent-blocked
  captures, storage-write failures, transport failures, hydration
  fallbacks (legacy alias folds performed), macro-rejections count.
  Bounded, redacted, no PII beyond what attribution requires.

## 8. Success thresholds (suggested; Hugo confirms numbers)

- Field-level divergence vs v1 on STABLE surfaces (all fields EXCEPT the
  pre-registered ruled deviations): < 0.5% of touches over the 7-day
  window.
- Ruled-deviation divergence: 100% explained by rule tags; zero unexplained.
- Zero consent violations: no event leaves the browser while consent is
  unresolved/denied (hard gate — any violation stops the rollout).
- Storage integrity: 0 incidents of v1 failing to read a v2-written payload.
- Transport health: >= 99% delivery success parity with v1 over 7 days.
- Page performance: v2 bundle main-thread cost <= v1 (compare long-task time).

## 9. One-tenant canary sequence

1. Pick ONE low-risk tenant site (single GTM container, known owner).
2. Enable `clicutcl_engine=v2`; run shadow comparison concurrently.
3. **48h soak**: watch error counters, consent gate, storage integrity;
   zero P1/P2 anomalies required to proceed.
4. **10% rollout** (next tier of sites, or 10% of traffic on the canary if
   multi-site traffic splitting exists): 7 days minimum shadow+live.
5. **Full rollout** per site only after its own 48h soak passes; sites may
   opt out via the per-site override indefinitely.
6. After full rollout + 30 days, remove the v1 runtime from the plugin
   (major version bump, changelog entry documenting D2/D3 behavioral
   deviations — see Hugo gate requirement).

Rollback at ANY stage = section 6. This plan gates on Hugo approval at
steps: initial execution, canary site selection, threshold confirmation,
and full rollout.
