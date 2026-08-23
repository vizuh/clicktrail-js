# Provenance Audit — clicktrail-js release candidate

Status: COMPLETE, 2026-08-24. Scope: every source file under
`packages/clicktrail/src/` and `tools/`. Plugin evidence repo:
`../click-trail-handler` (READ-ONLY; v1.9.0, GPL-2.0-or-later).
Method: `git log --diff-filter=A` per file for introduction commits, then
side-by-side comparison against plugin sources. No files outside `docs/`
were touched.

## 0. Contributor identities found (git author census)

**clicktrail-js** (`git log --format='%an <%ae>' | sort -u`):

| Author | Commits |
|---|---|
| Hugo Carvalho \<hugo@vizuh.com\> | all 15 commits in history |

Single-author repo. Every commit is from this session's agent lineage,
authored under Hugo Carvalho / Vizuh.

**click-trail-handler** (plugin):

| Author | Identity note |
|---|---|
| Atroci \<hugomoreiradecarvalho@gmail.com\> | 119 commits overall; 18 as `atroci` |
| Hugo \<hugomoreiradecarvalho@gmail.com\> | 40 commits |
| atroci \<hugomoreiradecarvalho@gmail.com\> | same address as Atroci |
| Claude \<noreply@anthropic.com\> | 2 commits: e43d29a + f653b7e (2026-06-10), PHPCS auto-fix formatting only |

All human identities resolve to the SAME email address
(hugomoreiradecarvalho@gmail.com) — i.e., one natural person (Hugo)
writing under three git identity spellings. The two `Claude` commits are
mechanical PHPCS formatting passes over PHP docblocks/naming and touch NO
ported logic (verified below). The Apointoo dashboard repo (see §2.1 chain
note) additionally contains `dependabot[bot]` commits, but none touch
`src/shared/lib/channel-classify.ts`.

## 1. AUTHORED HERE (this session, single commit introducing the file)

All files were introduced by commits authored by
Hugo Carvalho \<hugo@vizuh.com\> in this session:

| Introduced in | Files |
|---|---|
| 621e164 (Phase 1a) | `core/{diagnostics,index,knowledge,merge,parse,sanitize,types}.ts`, `conventions/{incubating,stable}.ts`, `incubating.ts`, `index.ts` |
| a144cf5 (#2 CI/docs) | no src files (workflows + READMEs only) |
| 1a03720 (#1 /browser) | `browser/{create-clicktrail,global-adapter,index,serialize,transport}.ts` |
| 60459f0 (#3 probe) | `global-entry.ts` |
| 01b5a12 (#4 storage) | `browser/{identity,payload-store,storage}.ts` |
| 7c5bc9b (#5 forms/links) | `browser/{form-injection,link-decoration}.ts` |
| 3e28135 (#6 harness) | `tools/wp-runtime/run-parity.mjs`, `tools/wp-runtime/PARITY-RUN.md` |
| fa3127b (#12 rulings) | `browser/browser-ids.ts` |
| f8fd72f (#7 /conversation) | `conversation/{chatwoot,index,journey-store,tracker}.ts` |
| 202814b (#8 /agent) | `agent/{index,recorder,tool-call,trace}.ts` |
| de0e0a1 (#9 /otel) | `otel/{destination,index,traceparent}.ts` |
| fb7c403 (#10 /apointoo) | `apointoo/{destination,index,outcome}.ts` |

Files in category 3 below carry PORTED LOGIC inside otherwise-authored
files; category 4 lists genuinely novel modules with no plugin ancestor.

## 2. PORTED / DERIVED from the WordPress plugin (logic, not literal code)

Per docs/ARCHITECTURE.md ("Fresh TypeScript written against the documented
contract; NEVER a literal port"), these are re-implementations whose
BEHAVIOR derives from plugin code. Each cites plugin file:line evidence.

### 2.1 `core/knowledge.ts` — classification tables (introduced 621e164; label layer landed 396a1ad)

| Table/function | Plugin evidence |
|---|---|
| `SEARCH_REFERRER_RULES`, `SOCIAL_REFERRER_RULES` (restructured to domain-suffix rules per ruling #5) | `clicutcl-attribution.js:66-84` |
| `CHANNEL_LABELS` + `resolveChannelLabel()` priority chain (ported per ruling #3; D2 certainty tiers are a NEW deviation on top) | `clicutcl-attribution.js:315-385` (resolveChannelLabel); AI-assistant block `:347-364` |
| `PAID_MEDIUMS`, `paidLabelFromSource()` (comment says "ported verbatim" / "ported") | `clicutcl-attribution.js:289-308` |
| `parseGaClientIdValue()` (self-described port) | `clicutcl-attribution.js:826-846` (BrowserIdentifiers.parseGaClientId) |
| `BROWSER_ID_KEYS`, `_fbp`/`_fbc`/`_ttp` variant folding, first-variant-wins order | `clicutcl-attribution.js:37-47`, collect branches `:859-896` |
| `PARAM_ALIASES.sc_click_id -> sccid` | `clicutcl-attribution.js:56` (CLICK_ID_ALIASES) + mapQueryFields `:1826-1830` |

**Chain note (important):** the PLUGIN itself states its `PAID_MEDIUMS`
and `paidLabelFromSource()` are "reference mirrors of the canonical Apointoo
TS classifier" (`apointoo-dashboard/src/shared/lib/channel-classify.ts`,
comments at attribution.js:288-295). So the ultimate origin of those two
items is the Apointoo TS file, not the plugin. That file's git history
shows only `atroci <hugomoreiradecarvalho@gmail.com>` plus one
Claude-run prettier format commit — i.e., also Hugo-authored — but the
Apointoo repo has **no LICENSE file and no `license` field** in
package.json. See §5 blockers.

### 2.2 `core/merge.ts` — mirror behavior (introduced 621e164; mirror ruling implemented fa3127b)

| Behavior | Plugin evidence |
|---|---|
| ft write-once gate counting `ft_<clickid>` keys (ruling #17 fix) | hasFirstTouch, `clicutcl-attribution.js:1770-1782` |
| Write-time click-ID mirror into `ft_<cid>` / `lt_<cid>` (runtime RULING B) | applyTouch writes ALL mapped fields incl. click IDs, `:1788-1799`; mapQueryFields emits click-ID fields `:1813-1837` |
| Top-level browser IDs newest-non-empty-wins | mergeTopLevelIdentifiers, `:1797-1811` |
| Last-touch unconditional overwrite (parity agreement #3) | `:1706-1708` |
| Legacy alias normalization used by payload-store (`first_*`->`ft_*`) | ATTRIBUTION_KEY_ALIASES `:48-59`; documented in plugin DATA-MODEL.md:123 |

NEW here (not derived): `applyClickIdSelectionAudit` — the D3 additive
keys `click_id_history`, `attribution_selected_click_id`,
`attribution_selected_click_id_reason` (Hugo gate ruling, no plugin
ancestor).

### 2.3 `browser/browser-ids.ts` — cookie parsing (fa3127b)

Port of the cookie-derived half of `BrowserIdentifiers`:

| Function | Plugin evidence |
|---|---|
| `parseCookieMap()` (semicolon split, lowercase names, decodeURIComponent with fallback) | getCookieMap, `clicutcl-attribution.js:792-810` |
| `parseGaSessionDataValue()` (GS2 `$s..$o..` regex, GS1. dot format, numeric-token fallback — regexes match verbatim) | parseGaSessionData, `:848-887` |
| `collectBrowserIdsFromCookies()` branch order (_fbp/_fbc/_ttp/li_gc/_ga/_ga*) | collect, `:859-907` incl. `.some()` loop `:884-897` |
| `applyBrowserIdentifiers()` newest-non-empty law | mergeTopLevelIdentifiers `:1797-1811` |

Deliberate non-ports (documented in-file): the `fbc = 'fb.1.'+Date.now()+fbclid`
derivation stays core-side (query param path); sanitizeValue length caps
differ per ruling #14.

### 2.4 Other plugin-derived items (smaller surface)

| Location | Derived behavior | Plugin evidence |
|---|---|---|
| `core/sanitize.ts` | macro rejection `/^\{\{.+\}\}$/` (ruling #15); control-char handling ruled deviation | sanitizeValue, `clicutcl-attribution.js:103-112` |
| `core/parse.ts` | referrer classification shape (search->organic, social->social, else host/referral) | classifyReferrerHost, `:275-296` |
| `browser/form-injection.ts` | `ct_` field prefix + field-name mapping | `includes/integrations/forms/class-abstract-form-adapter.php` (`$field_prefix = 'ct_'`) + Attribution_Provider field mapping |
| `browser/link-decoration.ts` | `ct_token` parameter name, approved-domain suffix rule, signed-token concept | tokenParam defaults `:756, :1262, :1660`; prepareSignedToken `:651` |
| `browser/payload-store.ts` | legacy key aliases table (see 2.2) | ATTRIBUTION_KEY_ALIASES `:48-59` |
| `tools/wp-runtime/run-parity.mjs` | executes the REAL plugin JS (GPL) loaded as text into a Node `vm` sandbox — development-time harness ONLY | loads `../click-trail-handler/assets/js/clicutcl-attribution.js` |

### 2.5 Explicitly NOT derived (checked, cleared)

- **`conversation/chatwoot.ts` attribute naming**: there is NO Chatwoot
  integration anywhere in the plugin (grep across includes/, assets/,
  docs/ returns nothing). `CHATWOOT_JOURNEY_ATTRIBUTE = 'ct_journey_id'`
  and the summary-key list are new work; they reuse canonical payload key
  names verbatim, which is the point of the design.
- `agent/*`, `apointoo/*`: no plugin ancestors.
- `serialize.ts` flat event shape: new schema (plugin pushes a nested
  `ct_attribution` object instead).

## 3. THIRD-PARTY DERIVED

Systematic scan (hash-algorithm constants, base64/codec idioms, crypto
calls, regex provenance) found NO copied library snippets. Findings:

1. **FNV-1a in `src/otel/traceparent.ts` (:79-88)**: the core loop
   (`h ^= charCode; h = Math.imul(h, 0x01000193)` with offset basis
   `0x811c9dc5`) is the STANDARD FNV-1a algorithm. FNV-1a was invented by
   Glenn Fowler, Landon Curt Noll, and Phong Vo, and the reference
   implementation was released to the PUBLIC DOMAIN (see Landon Noll's
   FNV pages and IETF `draft-eastlake-fnv`; the algorithm and its reference
   C code carry explicit public-domain statements). No license encumbrance;
   no attribution legally required. The surrounding code is HAND-WRITTEN:
   the `hashWords()` chained re-seeding scheme, `dezero()` W3C all-zero
   guard, and the Math.imul 32-bit idiom are not copied from any reference.
2. **W3C Trace Context** header format (`00-{trace}-{span}-{flags}`):
   spec compliance (W3C Recommendation), no code copied.
3. **WebCrypto HMAC-SHA256 / getRandomValues**: platform APIs, not code.
4. GA cookie formats (GS1./GS2 `$s…$o…`) are Google wire FORMATS parsed
   by our own regexes (regexes themselves derive from the GPL plugin —
   covered under §2.3).

## 4. LICENSE COMPATIBILITY (GPL-2.0-or-later plugin -> MIT npm package)

Position: every item in category 2 is a port of LOGIC (behavioral
specification), not literal source. All contributing human identities in
both repos resolve to Hugo Carvalho. Copyright holders may relicense their
own work under MIT without GPL obligations surviving — embedding MIT into
GPL is one-way permissive anyway (ARCHITECTURE.md decision record).

Assessment per category-2 item, ASSUMING sole ownership holds:

| Item | Verdict |
|---|---|
| knowledge.ts tables/label chain | CLEAN if ownership confirmed (incl. Apointoo chain, see blocker B2) |
| merge.ts mirror behavior | CLEAN — behavioral rules, fresh implementation |
| browser-ids.ts cookie parsing | CLEAN — but GS2/GS1 regexes are near-verbatim transpositions of plugin lines; logic-only claim is defensible since owner identical |
| sanitize/parse/form-injection/link-decoration fragments | CLEAN |
| run-parity.mjs loading GPL JS | CLEAN — dev-time aggregation of a GPL work with an MIT work inside one developer's repo is not distribution of a combined MIT work; MUST NOT ship inside the npm tarball (verify `.npmignore`/`files` excludes `tools/`) |

## 5. PUBLICATION BLOCKERS (uncertainties that need answers before `npm publish`)

- **B1 — Ownership attestation.** The whole MIT-relicense argument rests on
  ONE person having authored everything. Question for Hugo: do you confirm
  you are the sole copyright holder of all plugin contributions made under
  `Atroci`, `Hugo`, and `atroci <hugomoreiradecarvalho@gmail.com>`, and of
  all clicktrail-js commits? If ANY contractor or third party contributed
  to `clicutcl-attribution.js` or the ported PHP surfaces without an
  assignment/CLA, the MIT claim is unsound.
- **B2 — Apointoo chain license gap.** `PAID_MEDIUMS` +
  `paidLabelFromSource()` trace to `apointoo-dashboard/.../channel-classify.ts`,
  which carries no LICENSE and sits in a repo with other bot/agent
  committers. Question: confirm the channel-classify file is wholly your
  work (history suggests yes: only `atroci` + one mechanical prettier
  commit) so its logic may be relicensed MIT inside ClickTrail. Optional
  hardening: add a LICENSE to the Apointoo repo.
- **B3 — AI-authored-commit copyright posture.** The plugin's two
  `Claude <noreply@anthropic.com>` commits (PHPCS formatting) and this
  session's agent-lineage commits raise the unsettled question of
  copyright in AI-generated material. Formatting passes almost certainly
  lack originality; pure AI output is generally treated as the operator's
  under the tool's terms. Question: confirm Anthropic/Claude terms of use
  assign output rights to you, and record the attestation beside this
  audit. Low risk; document it rather than solve it.
- **B4 — npm scope + artifact hygiene.** Verify `@funnelsheet` scope
  ownership (already a stated precondition) AND that the published tarball
  excludes `tools/wp-runtime/` (which references and executes GPL plugin
  code) — check `packages/clicktrail/package.json` `files` field before
  publish.

## 6. Bottom line

39 source/harness files audited: ~24 wholly authored here, ~15 contain
plugin-derived logic with cited evidence, 0 contain copied third-party
library code, 1 standard public-domain algorithm (FNV-1a). The MIT
publication is clean CONDITIONAL on resolving blockers B1-B4. Nothing in
this audit authorizes publication.
