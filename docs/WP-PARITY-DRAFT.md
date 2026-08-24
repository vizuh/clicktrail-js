# WP Parity Draft — Plugin Behavior vs New TS Engine

Status: DRAFT, 2026-08-23. Work queue item #6 (preparation stage for Phase 2 parity gate).

- **Source of truth analyzed**: `click-trail-handler/assets/js/clicutcl-attribution.js` (v1.8.x line refs below) + `clicutcl-events.js` (outbound attribution allowlist only) + `docs/guides/TRACKING-ATTRIBUTION-PORTABLE-PROMPT.md`.
- **Compared against**: `clicktrail-js/packages/clicktrail/src/core/{parse,knowledge,merge,sanitize}.ts`.
- **Artifacts**: 23 draft fixtures in `packages/clicktrail/fixtures/wp-parity-drafts/`, same schema as the existing goldens.
- Method: static read-only analysis of the plugin JS. Nothing in the plugin repo was modified; nothing was built or committed.

## Counts

| Category | Count |
|---|---|
| Fixtures drafted | 23 |
| Agreements (plugin == engine) | 4 |
| Disagreements | 17 |
| Open questions (UNDECIDED) | 2 |

## Confirmed agreements

1. **Empty UTM values never create fields** (`wp-empty-utm-values-dropped.json`). Plugin: `sanitizeValue('') → ''` then skipped. Engine: `raw !== ''`.
2. **www-normalized same-host referrer creates no touch** (`wp-www-internal-referrer.json`). Both strip leading `www.` before comparing.
3. **Last touch always overwrites on a valid signal** (`wp-last-touch-always-updates.json`). Plugin `applyTouch('lt', …)` unconditional (attribution.js:1706–1707); engine merge last-touch block.
4. **Referrer medium strings are identical**: `'organic'` / `'social'` / `'referral'` (attribution.js:275/283/289 vs parse.ts referrer branch). Note: these medium strings agree even though the separate channel-taxonomy layer does not (see below).
5. Bonus partial agreement: `sc_click_id → sccid` alias folding exists in both (plugin CLICK_ID_ALIASES:45 + mapQueryFields:1824–1834; engine PARAM_ALIASES). Recorded inside a disagreement fixture because surrounding behavior differs.

## Disagreements and open questions

| # | Topic | Plugin behavior (file:line) | Engine behavior | Fixture | Suggested ruling |
|---|---|---|---|---|---|
| 1 | Click ID list | 16 keys incl. `rdt_cid`, `pin_cid`, `snap_cid`, `mc_cid`, `mc_eid`, `dclid` (attribution.js:27–31) | 10 keys (knowledge.ts CLICK_ID_KEYS) | wp-rdt-cid-extra-click-id, wp-mc-eid-mailchimp | **Accident-leaning**: documented portable contract lists exactly the engine's 10; events.js outbound allowlist (events.js:1879–1884) also exports only the 10. The extra 6 look like storage-only legacy. Decide whether to capture-and-drop or drop entirely. |
| 2 | Bare click-ID inference | NO source/medium inferred from click IDs; only the raw id field + channel label (mapQueryFields:1813–1837; resolveTouch) | CLICK_ID_PLATFORMS infers source+medium=cpc (parse.ts campaign path) | wp-gclid-only-no-source-medium, wp-fbclid-only-organic-facebook | **Contract-leaning for engine** (useful, lossless), but it is an ADDITION over real plugin behavior — must be recorded as intentional deviation, not "parity". fbclid case is worst: plugin gives 'Facebook Organic', engine 'paid_social'. |
| 3 | Channel taxonomy | Human labels: 'Google Ads', 'Facebook Organic', 'Mailchimp', 'ChatGPT'… written to `ft_channel`/`lt_channel` (resolveChannelLabel:315–385) | Enum: paid_search / organic_search / organic_social / referral / email… | several `_channel` expectations | **UNRESOLVED DESIGN QUESTION**: engine has no channel-label layer at all. Either port the label set or declare labels out of TS scope. Blocks every `_channel` fixture. |
| 4 | Referrer source value | Canonical name: 'google', 'bing', 'yahoo'… (SEARCH/SOCIAL_REFERRER_RULES:66–84) | Full host: 'google.com' (classifyReferrerHost in parse.ts) | wp-referrer-canonical-source-name | **Plugin is contract**: canonical names are what downstream reports consume; host strings leak TLD churn. |
| 5 | Search-engine match style | google/yahoo/yandex matched as LABEL anywhere in host (`(^|\.)label\.`), so search.yahoo.co.jp = Yahoo (hostMatchesLabel:238–245) | suffix fragment `.includes()`: 'yahoo.com' misses yahoo.co.jp; 'google.' over-matches e.g. 'notgoogle.com'-style hosts | wp-yahoo-intl-label-match | Adopt explicit domain-suffix rules with intl TLDs enumerated; drop label regex. |
| 6 | Brave/Startpage | Not classified → referral | ORGANIC_SEARCH_HOSTS includes them | wp-brave-search-engine | Keep as intentional engine addition (record in classifier notes). |
| 7 | Social list breadth | 8 platforms only (no whatsapp/telegram/discord/threads/redd.it/pin.it/fb.com) | ~20 hosts | wp-whatsapp-social-engine-only | Keep engine list as addition; pin each host with its own fixture at freeze time. |
| 8 | Related-host symmetry | SYMMETRIC: either host subdomain-of other → internal (areRelatedHosts:220–227); protocol must be http(s) (getExternalReferrerDetails:387–404) | ONE-DIRECTIONAL: only referrer-is-subdomain-of-currentHost (sanitize.ts hostMatches) | wp-sibling-subdomain-internal-referrer | **Plugin is contract**: sibling-subdomain journeys (shop.site.com ↔ site.com) must not create fake referral touches. Real bug class in the engine. |
| 9 | Query-key casing | sanitizeKey lowercases ALL keys → mixed-case UTMs work (attribution.js:86–90) | URLSearchParams is case-sensitive | wp-utm-key-case-insensitive | **Plugin is contract** (cheap tolerance, avoids silent signal loss). |
| 10 | '+' decoding | decodeURIComponent only → '+' preserved literally (getQueryParams:430–437) | URLSearchParams decodes '+' as space | wp-plus-sign-preserved | Engine behavior matches browser/URL standard AND how the ad platform encodes spaces; recommend keeping engine behavior and marking plugin's literal-'+' as accident. Existing golden google-ads-utm-gclid already assumes engine behavior. |
| 11 | Duplicate params | Regex loop → LAST occurrence wins | searchParams.get → FIRST wins | wp-duplicate-param-last-wins | Low stakes; pick one explicitly. Last-wins mirrors most server parsers. |
| 12 | Landing page | FULL href incl. query string (applyTouch:1790–1794) | origin+pathname, query stripped (safeOriginPath) | wp-landing-page-includes-query | Decide deliberately: query-less keeps PII/noise out but loses gclid-on-landing evidence. Plugin behavior = full href. |
| 13 | Timestamp format | `new Date().toISOString()` → ALWAYS milliseconds ('…T10:00:00.000Z') | goldens show second precision | wp-timestamp-millisecond-precision | Formatting-only; freeze one form before schema v1. |
| 14 | Value length caps | Two passes: 256 (getQueryParams) then 128 (mapQueryFields) → effective 128 for touch fields; referrer 256 | uniform 512 (sanitize.ts MAX_FIELD_LENGTH) | wp-value-length-cap | UNDECIDED — see open questions. |
| 15 | Macro rejection | Values matching `{{…}}` rejected outright (sanitizeValue:103–106) | kept literally | wp-template-macro-value-rejected | **Plugin is contract**: unsubstituted FB macros pollute reports. Cheap to adopt. |
| 16 | Sanitization detail | Control chars replaced by SPACE; truncation after trim | control chars DELETED | (not fixture-pinned) | Cosmetic; fold into length-limit decision. |
| 17 | First-touch guard scope | `hasFirstTouch` also counts `ft_<clickid>` keys (1775–1782): a click-ID-only first touch blocks later ft writes | ftEmpty checks only source/medium/campaign/referrer/landingPage → would overwrite | wp-first-touch-guard-counts-click-ids | **Plugin is contract**: a bare-gclid landing IS a first touch. Engine merge needs click IDs in the emptiness check. |

## Open questions (need supervisor decision)

1. **Channel taxonomy**: does the TS engine own a channel-label layer at all (plugin's 'Google Ads'/'Facebook Organic'/AI-assistant labels), or do enum channels replace it? This decides ~8 fixtures' `_channel` expectations. Related sub-question: AI-assistant referrers (chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, grok.com, copilot, deepseek — attribution.js:347–360) have no engine equivalent (`wp-chatgpt-ai-assistant-referrer.json`).
2. **Field length limits**: 128/256 (plugin) vs 512 (engine)? Any limit change is a classifier-visible change and must be frozen before goldens lock.

## Recommended rulings summary (for supervisor)

- Adopt plugin as contract: symmetric related-host check (#8), key-case tolerance (#9), canonical referrer source names (#4), macro rejection (#15), first-touch guard counting click IDs (#17).
- Keep engine behavior, mark as intentional improvement: '+' decoding (#10), richer social/search lists (#6, #7).
- Decide: channel taxonomy (#3), click-ID list extras (#1), bare-click-id inference (#2), landing-page query (#12), timestamp precision (#13), duplicate params (#11), length caps (#14).

## Harness note

Two merge-level fixtures (`wp-first-touch-guard-counts-click-ids`, `wp-last-touch-always-updates`) use an extra top-level `"stored"` key holding the pre-existing payload. The current golden schema has no stored-state input; Phase 2's fixture runner must support it (deterministic: stored payload merged via the engine's own merge path). Flagged here so the schema extension is a conscious decision.

## Explicitly out of scope this pass

Consent gating, pending-capture promotion (sessionStorage `ct_pending_v1`), cross-domain token sign/verify, link decoration, form injection, session manager (30-min timeout), bot detection — all adapter/browser-layer behaviors scheduled for Phase 2, not core classification. One observation parked for later: pending capture merges `pending.params ← currentParams` (current page wins last-touch, attribution.js:1644–1656), which is itself parity-relevant when tested end-to-end.


---

## SUPERVISOR RULINGS (2026-08-23) — binding for Phase 2

| # | Topic | Ruling |
|---|---|---|
| 1 | Click-ID list | ENGINE 10-key list is CONTRACT. Plugin extras (rdt_cid, pin_cid, snap_cid, mc_cid, mc_eid, dclid) = ACCIDENT (storage-only legacy). Drop entirely. |
| 2 | Bare click-ID inference | ENGINE inference is CONTRACT (intentional deviation). Plugin's bare-fbclid -> 'Facebook Organic' is factually wrong attribution. Recorded as classifier deviation; MUST be confirmed by Hugo before the WP runtime swap ships (major version + changelog). |
| 3 | Channel taxonomy | PORT the label layer into core knowledge.ts as a versioned CHANNEL_LABELS map writing ft_channel/lt_channel (incl. AI-assistant labels). Enum channels stay as the machine-readable layer. Resolves open question 1. |
| 4 | Referrer source names | PLUGIN is contract: canonical names ('google', 'bing', ...), never raw hosts. |
| 5 | Search matching | Explicit domain-suffix rules incl. intl TLDs (yahoo.co.jp etc.). No label regex. |
| 6 | Brave/Startpage | ENGINE addition kept; pin with fixtures at freeze. |
| 7 | Social breadth | ENGINE list kept; pin each host with its own fixture at freeze. |
| 8 | Related-host symmetry | FIX ENGINE: symmetric check (either host subdomain-of other) + http(s)-only referrer protocol. |
| 9 | Query-key casing | FIX ENGINE: lowercase all query keys before lookup. |
| 10 | '+' decoding | ENGINE kept (URL standard). Plugin literal-'+' = accident. |
| 11 | Duplicate params | LAST-wins (plugin + server-parser convention). Fix engine. |
| 12 | Landing page | PLUGIN contract: full href incl. query string. Privacy note: consent already gates storage; revisit redaction if PII patterns observed. |
| 13 | Timestamps | Millisecond ISO ('...T10:00:00.000Z') frozen — plugin + ISO standard. |
| 14+16 | Length caps / control chars | ENGINE uniform 512 kept; plugin two-pass 128/256 = accident. Control-char deletion kept. Documented deviation. |
| 15 | Macro rejection | FIX ENGINE: reject '{{...}}' values outright. |
| 17 | First-touch guard | FIX ENGINE: emptiness check must include ft_ click-ID keys. |

Harness: fixture schema EXTENDED with top-level `stored` key (pre-existing payload merged via the engine's own merge path). Approved.


---

## SUPERVISOR RULINGS — RUNTIME FINDINGS (2026-08-23)

| Finding | Ruling |
|---|---|
| Browser-ID collection missing | SPLIT: (a) URL-param browser IDs (fbc, fbp, ttp, li_gc, ga_* as query params) populate top-level payload keys in CORE parse — deterministic, fixture-pinnable. (b) Cookie-derived IDs (fbp/ttp/li_gc cookies, GA ids) collected by the /browser adapter behind consent gate and merged top-level. Core never touches cookies. |
| ft_<cid>/lt_<cid> click-ID mirror | PLUGIN is CONTRACT: merge mirrors each captured click ID into the touch fields at first- AND last-touch write time (matches applyTouch(mapQueryFields)). Redundant but required for WP-swap field-for-field parity; downstream consumers may read them. |

Target after implementation: runtime harness diffs shrink to approved standing deviations (#1/#2/#6/#7/#10/#14), plus explicit Hugo gate D2/D3 fields.

Runtime parity gate:

- Local and CI runs must execute plugin commit `ead6682d6433c4f27309b7ee412e2dfc1fd50de4`; the harness fails on any other checkout and records the commit in `PARITY-RUN.md`.
- The legacy parity projection treats optional empty `click_id_history` (`[]`) as equivalent to an absent plugin field. Non-empty history remains visible.
- D3 fields (`click_id_history`, `attribution_selected_click_id`, `attribution_selected_click_id_reason`) are additive engine-contract checks, reported as ruled differences rather than hidden.
- The classifier follows Hugo gate D2: bare `fbclid` is platform-known but paid status remains unknown without explicit paid evidence.

| Sticky top-level click IDs | ENGINE keeps newest-non-empty-wins (consistent with last-touch philosophy; ft_/lt_ mirrors now give consumers BOTH first and latest values). Recorded as standing deviation D3 -> joins the Hugo confirmation gate before WP swap. |


---

## HUGO GATE RULINGS (2026-08-23, release-candidate directive) — SUPERSEDE prior D2/D3 notes

### D2 — bare fbclid classification
A bare fbclid must NOT be classified as 'Facebook Ads' AND NOT definitively as
'Facebook Organic'. Meta appends fbclid automatically to outbound links from
Facebook and Instagram surfaces, not exclusively to advertisements — both prior
labels are over-certain.

Canonical model for uncertain click IDs (fbclid, ttclid, twclid, li_fat_id,
sccid, epik):
- source_platform: the platform name ('facebook', 'tiktok', ...)
- traffic_class / channel: UNKNOWN — promoted to paid_social ONLY on explicit
  additional evidence: paid UTM values, campaign/ad metadata, or an integration
  signal
- certain-paid click IDs (gclid, wbraid, gbraid, msclkid — advertising-only
  identifiers) keep their paid classification

The old WordPress label ('Facebook Organic') survives ONLY as a temporary
legacy compatibility output (`legacyWordPressChannelLabel`), never in the
canonical model.

### D3 — competing click IDs
Top-level click IDs use NEWEST-VALID-WINS (already engine behavior — confirmed).
Additionally required:
- preserve first-touch IDs (ft_<cid> mirrors — exists)
- preserve complete click-ID history: new additive payload key
  `click_id_history` (JSON array of {k, v, t}, capped)
- record which ID was selected for attribution and why:
  `attribution_selected_click_id` + `attribution_selected_click_id_reason`
- empty, invalid, or expired IDs never overwrite a valid ID (empty already
  cannot; validity = non-empty post-sanitization)

Rationale: destination APIs tie offline conversions to the click within a
conversion window (Google Ads import rules); a stale first ID risks failed or
wrong-window uploads, while first-touch/history retention keeps every
attribution model (first, last, future multi-touch) computable.
