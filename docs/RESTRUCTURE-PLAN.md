# ClickTrail Restructure Plan — Council-Ratified

Status: RATIFIED by 5-person council (all high confidence), 2026-08-24.
Chairman synthesis of Aristotle, Torvalds, Machiavelli, Munger, Taleb.
Supersedes ad-hoc sequencing in earlier work-queue notes. Contract authority:
docs/EVENT-CONTRACT.md (authoritative).

## Ratified decisions

1. Single namespace: everything publishes under @vizuh/* except the unscoped
   n8n community node name (platform convention, documented exception).
   Integrations become @vizuh/clicktrail-astro, @vizuh/clicktrail-nuxt,
   @vizuh/piece-clicktrail, @clicktrail/typebot-block -> @vizuh/clicktrail-typebot,
   directus-extension-clicktrail (unscoped per Directus registry convention).
   MINORITY (Taleb, 1-4): register @clicktrail org defensively vs typosquatting.
   Ruling deferred to Hugo.
2. Canonical event contract (nine events) enforced through ONE shared builders
   module; integration packages contain zero hardcoded event names. Renames are
   then one-file changes.
3. Physical split into FOUR packages behind an UNCHANGED '@vizuh/clicktrail'
   import surface: core (schemas, validation, id generation incl. UUIDv7-style
   event_id, retry classification, transport helpers, attribution engine),
   browser (existing /browser surface), server (ingestion client, identity
   parsing, conversion builders — currently duplicated in 4+ integrations),
   consent (state types, gates, listeners — currently duplicated in 2+).
   attribution/testing stay inside core/repo tooling until external demand
   (MINORITY: Aristotle would split immediately; deferred).
4. Layout: packages/ (library), integrations/ (platform adapters),
   templates/ (GTM gallery artifacts).
5. Submission ladder (amended): WordPress -> Astro+Nuxt publish -> n8n verify ->
   Activepieces piece -> Typebot block issue-proposal -> Cal.com Attribution app
   -> Directus+Strapi -> GTM gallery ONLY after public collector API docs +
   B1-B3 attestations signed -> RudderStack -> Segment.
6. Ethics policy (EVENT-CONTRACT.md section) binds every submission; violations
   block the PR regardless of technical quality.

## Repository naming convention (Hugo ruling, 2026-08-25)

All ClickTrail GitHub repositories are BRAND-FIRST: `clicktrail-<ecosystem>`.
Current org inventory is fully conformant (clicktrail-js, -php, -laravel,
-symfony, -shopware, -filament, -craft, -october, -twig, -psr-middleware,
-gtm-event-tag, -gtm-attribution-variable).

Rule details:
- Ecosystem package names keep their platform conventions INSIDE each repo
  (Composer vendor prefixes, npm scopes, Shopware plugin names); only the
  GitHub repository name follows the brand-first rule.
- Future repos: clicktrail-wordpress, -woocommerce, -shopify, -vue, -react,
  -nextjs, -svelte, -angular, -drupal, -joomla, -odoo, -magento,
  -prestashop follow the same pattern.
- Renamed 2026-08-25: shopware-clicktrail -> clicktrail-shopware;
  filament-clicktrail -> clicktrail-filament (0 stars, redirects active).

## Phases

### Phase 0 — checkpoint (immediate)
Commit current branch state (docs overhaul, examples, site, five integration
scaffolds as they report) in logical commits. Free option per Taleb: nothing
after this point is uncommitted.

### Phase 1 — extraction (same week)
- Create packages/{core,browser,server,consent}; move code; @vizuh/clicktrail
  becomes umbrella re-export (zero wrapper breakage; version bump minor/additive).
- Shared builders module lands in core: canonical nine events + translation map
  from pre-contract names. One migration pass over finished integration
  scaffolds (mechanical, one file each).
- event_id mint-at-enqueue + persisted queue + collector dedupe contract
  implemented in core transport; documented for the collector team.
- Gates: pnpm -r test green, strict tsc clean, probe/parity untouched.

### Phase 2 — integration migration (follows Phase 1)
- Move integration folders to integrations/*; rename npm identities per #1;
  imports switch to new subpaths where beneficial but @vizuh/clicktrail shims
  remain for one minor cycle.
- Contract-alignment audit: every integration emits only canonical names +
  required field vocabulary; PII only via explicit mapping (policy check).

### Phase 3 — publish wave 1
- Prereq: B1-B3 attestations signed (Hugo), governance checklist complete.
- Publish @vizuh/clicktrail umbrella update + @vizuh/clicktrail-astro +
  @vizuh/clicktrail-nuxt. Astro catalog auto-lists via keywords.

### Phase 4 — acceptance runs
- n8n community node verification submission; Activepieces piece PR (small:
  one focused action set); Typebot UPSTREAM-ISSUE-DRAFT posted BEFORE any PR
  (maintainers validate spec first); Directus extension publish (registry
  mirrors npm); Cal.com Attribution app build starts here (first deep product
  integration: attributed bookings).

### Phase 5 — distribution expansion (gated)
- Collector public beta endpoint + versioned API docs ship.
- THEN GTM gallery templates (event tag + attribution variable) submitted.
- RudderStack destination; Segment (last, post commercial-support model).

## Kill criteria / circuit breakers

- Any catalog rejection twice on the same lane -> freeze that lane, escalate to
  Hugo with reviewer text; do not iterate blindly.
- Collector API slip > 4 weeks -> GTM rung moves to backlog permanently until
  API exists; Astro/Nuxt/n8n lanes continue unaffected.
- Any ethics-policy violation found in review -> submission blocked, fix first.
- Solo-maintainer load > ~4 active submissions at once -> pause new lanes.

## Open rulings for Hugo (non-blocking for Phases 0-1)

R1. booking_completed vs sale disjointness: proposal = paid appointments emit
    BOTH booking_completed AND sale; unpaid lifecycle emits booking only.
R2. lead_updated / lead_merged as EXTENSION events outside the canonical nine
    (consumers may ignore). Proposal accepted by default unless vetoed.
R3. Defensive @clicktrail org registration now vs never (minority Taleb).
R4. B1-B3 attestation signing dates (blocks ALL publishes, not just wave 1).
