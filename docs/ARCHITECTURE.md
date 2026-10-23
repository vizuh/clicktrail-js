# ClickTrail JS — Architecture

Status: v1 draft, 2026-08-23. Derived from a 4-person council deliberation
(Feynman / Lovelace / Torvalds / Taleb lenses) over the existing
`click-trail-handler` WordPress plugin (v1.8.x) and its Portable Tracking
Prompt contract.

## Decision record (council verdict)

| Axis | Verdict | Notes |
|---|---|---|
| Packaging | One public package `@vizuh/clicktrail`, subpath exports | Split into multiple packages only when a consumer needs independent lifecycles |
| Implementation | Fresh TypeScript written against the documented contract; NEVER a literal port of the plugin IIFEs | Ported minified code launders legacy bugs into the "new" engine |
| Spec mechanism | Golden fixtures captured from live plugin behavior ARE the executable spec | Before freezing goldens, decide explicitly (in writing) which legacy quirks are contract vs accident |
| Versioning | Two independent stamps on every payload: `schema_version` (additive) and `classifier_version` (semantic) | A classifier behavior change ships only as a major release |
| License | MIT (whole repo), after copyright-provenance verification | WP plugin stays GPL-2.0-or-later; MIT embeds cleanly into GPL |
| Preconditions | Verify npm scope `@vizuh` ownership + contributor copyright chain before first publish | One-way doors |

## Determinism rule (core law #1)

`src/core` is deterministic and side-effect free:

- No `Date.now()`, `Math.random()`, `performance.now()` in core.
- No access to `window`, `document`, cookies, storage, network, or console.
- Time, IDs, stored state, consent state are ARGUMENTS, supplied by callers.

Consequences this buys:

- Replayable debugging: capture inputs once, reproduce attribution exactly.
- Identical results in WP plugin, Next.js, dashboard, and CI.
- Golden fixtures are possible at all.
- Classifier upgrades can be diffed fixture-by-fixture before release.

Effects (clock, randomness, storage, transport) belong to adapter subpaths
(`/browser`, `/conversation`, `/agent`, `/otel`, `/apointoo`) and are built
against the frozen contract, never inside core.

## Entry points (modeled on OpenTelemetry semantic-conventions)

| Import | Stability | Contents |
|---|---|---|
| `@vizuh/clicktrail` | stable, semver-protected | Stable ATTR_/EVENT_/VALUE_ constants, payload schema types, pure core engine |
| `@vizuh/clicktrail/browser` | stable adapter | Browser lifecycle, storage, forms, dataLayer and HTTP destinations |
| `@vizuh/clicktrail/conversation` | incubating | Journey and conversation tracking |
| `@vizuh/clicktrail/agent` | incubating | Metadata-only agent-run recording |
| `@vizuh/clicktrail/otel` | incubating | Trace-context helpers and destination |
| `@vizuh/clicktrail/apointoo` | incubating | Apointoo outcome destination |
| `@vizuh/clicktrail/incubating` | unstable, may break between minors | Journey/conversation/agent conventions, experimental attributes |

Constant naming follows the OTel convention:
`ATTR_${name}`, `${NAME}_VALUE_${enum}`, `EVENT_${name}`.

## Phased plan

- **Phase 1a (this repo, now)**: stable conventions + types, pure core
  (parse / classify / merge / sanitize), version stamps, fixture harness,
  property-style tests for merge laws.
- **Phase 1b (immediately after)**: thin `/browser` — payload serialization +
  transport + `window.ClickTrail` global adapter; exit criterion is an
  integration probe (Playwright replays fixtures end-to-end in a real page).
- **Phase 2**: storage/session/form injection co-built with the WordPress
  swap; field-for-field parity gate; fixtures become the permanent release
  gate.
- **Shipped in 0.1.0**: `/conversation`, `/agent`, `/otel`, `/apointoo` remain
  incubating while their host contracts gather production evidence.

## Product lanes queued (from Hugo, 2026-08-23)

These shape Phase 1b/2 APIs; core stays untouched:

- **Diagnostics**: leveled, opt-in (`silent | warn`), e.g. landing without any
  attribution signal, click ID present but UTMs absent, consent denied while
  capture attempted. Default: silent. Structured, redacted by default.
- **Consent flaw finding**: detect consent-capture gaps (events flowing while
  consent unresolved/denied; CMP bridge misconfiguration).
- **Cross-domain**: approved-domain continuity + link decoration, ported from
  the plugin contract.
- **Logging**: bounded, retention-aware local logs; no PII beyond what
  attribution requires.

## Frozen formats (WP-parity rulings, 2026-08-23)

Binding rulings and their fixture-level pins live in `docs/internal/WP-PARITY-DRAFT.md`
(supervisor rulings table). Formats every caller must honor:

- **Timestamps**: millisecond ISO-8601 (`'2026-08-23T10:00:00.000Z'`) — exactly
  what `new Date().toISOString()` emits. Callers own the clock and must pass
  millisecond precision; core stores the string verbatim.
- **Channel labels**: `ft_channel` / `lt_channel` carry human-readable labels
  ('Google Ads', 'Facebook Organic', AI-assistant names) from the versioned
  `CHANNEL_LABELS` table; machine enum channels remain authoritative.
- **Channel codes (opt-in)**: `ft_channel_code` / `lt_channel_code` carry the
  machine `Channel` enum next to the labels. See [Channel codes](#channel-codes-opt-in).
- **Versions**: `SCHEMA_VERSION`/`CLASSIFIER_VERSION` are at `1.2.0` for the
  `0.1.0` package line; these bumps record semantic decisions, not published
  breaking releases.
- **dataLayer push shape**: the browser `dataLayerDestination()` projection
  has its own stamp, `datalayer_version` (`DATALAYER_VERSION`, `2.0.0`),
  independent of the payload stamps above. 2.0.0 pushes Google tag field
  names as `ct_<name>` and the canonical `page_view` as `ct_page_view`
  (#48); a change to which keys or `event` values reach the dataLayer bumps
  its major.

### Channel codes (opt-in)

`createClickTrail({ channelCodes: true })` (core:
`mergeAttributionTouch(stored, touch, { channelCodes: true })`) also stores
the touch's machine `Channel` value as `ft_channel_code` / `lt_channel_code`
(`CHANNEL_CODE_KEYS`). Use the code for CRM, warehouse, and reporting joins;
keep the label for display.

- Default OFF. The WordPress plugin stores labels only and its
  `marketing_trail` envelope has no channel slot, so the default payload,
  `emptyAttribution()`, and the envelope are unchanged.
- Same lifecycle as the labels: the first-touch code is write-once and the
  last-touch code is rewritten on every touch. A first touch stored before
  the option was enabled has no `ft_channel_code`; there is no backfill,
  because the code cannot be derived from the label (table below).
- With the option off, every new `ft_`/`lt_` write removes that side's code
  key, so a stale code never sits next to a newer label.
- Values: `paid_search`, `paid_social`, `paid_other`, `organic_search`,
  `organic_social`, `referral`, `email`, `affiliate`, `unknown`. `direct` is
  part of the enum but the parser never emits it (no signal = no touch).

The label and the code come from two independent rule sets
(`resolveChannelLabel()` vs. the parser's classification), so one label maps
to several codes. Mapping on `CLASSIFIER_VERSION` 1.2.0:

| `ft_channel` / `lt_channel` label | `*_channel_code` | Deciding input |
|---|---|---|
| Google Ads, Microsoft Ads | `paid_search` | `gclid` / `wbraid` / `gbraid` / `msclkid` (medium defaults to `cpc`) |
| Google Ads, Microsoft Ads, Facebook Ads, LinkedIn Ads, X Ads, Reddit Ads, TikTok Ads, Pinterest Ads, Snapchat Ads | `paid_other` | paid `utm_medium` (`cpc`, `ppc`, `paid`, …) and no click ID |
| Facebook Ads, LinkedIn Ads, X Ads, TikTok Ads, Pinterest Ads, Snapchat Ads | `paid_social` | `fbclid` / `li_fat_id` / `twclid` / `ttclid` / `epik` / `sccid` plus a paid `utm_medium` |
| Facebook, LinkedIn, X, TikTok, Pinterest, Snapchat | `unknown`, or the `utm_medium` class (`email`, …) | the same click IDs without a paid `utm_medium` |
| Paid Search, Paid Social | `paid_other` | paid `utm_medium` with an unrecognised source |
| Google Organic, Bing Organic, Yahoo, DuckDuckGo, Yandex, Brave, Startpage, Ecosia, Baidu | `organic_search` | search-engine referrer |
| Facebook Organic, Instagram Organic, LinkedIn Organic, X Organic, Reddit Organic, TikTok Organic, Pinterest Organic, YouTube, Threads, WhatsApp, Telegram, Discord | `organic_social` | social referrer |
| ChatGPT, Perplexity, Claude, DeepSeek, Microsoft Copilot (`copilot.microsoft.com`), Grok (`grok.com`) | `referral` | AI-assistant referrer |
| Gemini (`gemini.google.com`), Microsoft Copilot (`bing.com/chat`) | `organic_search` | host matches a search-engine rule |
| Grok (`x.com/i/grok`) | `organic_social` | host matches a social rule |
| HubSpot, Salesforce Pardot, Constant Contact | any code, from `utm_medium` | `utm_source` names the platform |
| Unknown | `unknown`, `email`, `affiliate`, `referral`, `organic_search`, `organic_social` | UTMs without a paid medium, other referrers |

Known edges, recorded and not changed by the code field: `utm_medium=cpc`
without a click ID is `paid_other` even when `utm_source=google`;
`utm_medium=paid_social` is also `paid_other`; `gclid` alone is
`paid_search`; `fbclid` alone is `unknown`. `Mailchimp`, `Display & Video 360`
and `Instagram` exist in `CHANNEL_LABELS` but no current rule produces them.

## Fixture policy

- Fixtures live under `packages/clicktrail/fixtures/` as JSON:
  `{ name, description, quirk_decision, input, expected }`.
- `quirk_decision` records whether each behavior is CONTRACT (intentional,
  preserved forever within the major) or ACCIDENT (legacy bug, may be fixed
  at next major).
- No fixture update without a semver decision recorded beside it.
