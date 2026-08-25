# ClickTrail OSS Contribution Plan

Status: planning only. No issues or pull requests have been opened from this
plan.

Prepared: 2026-08-25
Source: Hugo's 100-repository target list plus read-only repository checks.

## Goal

Place ClickTrail in useful open-source products without forcing a tracking
vendor, changing a host's consent model, or sending data to Vizuh by default.

The default contribution shape is a small, provider-neutral attribution
contract. ClickTrail JS is one optional adapter that can populate that
contract. The host keeps control of storage, retention, consent, and delivery.

## Rules for every target

1. Start with an issue or maintainer comment. Do not send an unsolicited large
   PR.
2. Use a fork and a named branch. Never push to a third-party `main` branch.
3. Keep the first change small: one integration surface, tests, and docs.
4. Make the integration opt-in. Installation alone must do nothing.
5. Gate browser persistence and transmission on the host's consent decision.
6. Allowlist campaign fields only: `utm_*`, `gclid`, `gbraid`, `wbraid`,
   `fbclid`, `msclkid`, `ttclid`, and ClickTrail's stable attribution stamps.
7. Do not send PII, visitor/session IDs, prompts, completions, transcripts, or
   arbitrary request objects by default.
8. Preserve the host's existing schema. Prefer a named attribution/metadata
   object or an existing custom-field extension point over unrelated columns.
9. Add tests for denied consent, missing values, malformed values, and duplicate
   conversion delivery.
10. Document the exact license and compatibility boundary before proposing a
    native dependency.

## Priority queue

Scores below are from the supplied target list. Stars and activity can drift.
Rows marked **verified** were checked read-only on 2026-08-25. Other rows need a
fresh check before contact.

### Wave 0 — design partner and small proof

| Priority | Repository | Why now | Proposed first contribution | Status |
|---|---|---|---|---|
| 0 | [clawnify/OpenSalon](https://github.com/clawnify/OpenSalon) | Direct booking flow; TypeScript/Hono/SQLite; MIT; no open issues or PRs. About 30 stars, so this is an approachability target, not a reach target. **Verified.** | Open an issue proposing an optional, provider-neutral `attribution` object on appointment creation and retrieval. Include a ClickTrail JS example that fills the allowlisted fields. Do not add a ClickTrail dependency in the first change. | [Issue #4](https://github.com/clawnify/OpenSalon/issues/4); awaiting maintainer feedback |
| 1 | [Draggable/formeo](https://github.com/Draggable/formeo) | MIT form builder with a renderer and event/test surface. About 605 stars; active. **Verified.** | Add a short integration example showing consent-gated ClickTrail form injection and one structured submit event. Keep Formeo core unchanged unless maintainers request a hook. | [Draft ready](./oss-contributions/formeo-attribution-example-issue.md) |
| 2 | [glhd/aire](https://github.com/glhd/aire) | Laravel form builder; MIT; directly supports the PHP/Laravel distribution path. About 544 stars; active. **Verified.** | Add a docs recipe for ClickTrail hidden fields and server-side attribution handoff. Use a host-owned consent gate and avoid adding a package dependency in the first PR. | [Draft ready](./oss-contributions/aire-attribution-recipe-issue.md) |

### Wave 1 — strongest contribution candidates

| Priority | Repository | Why it fits | Proposed first contribution | Main risk |
|---|---|---|---|---|
| 3 | [DjangoCRM/django-crm](https://github.com/DjangoCRM/django-crm) | Score 100 in the supplied list; Python/Django; lead source, contact forms, leads, deals, and analytics are already explicit. About 616 stars; active; contribution guide present. **Verified.** | Ask whether maintainers prefer a provider-neutral `attribution` field on lead/request creation or an optional Django adapter. Start with request/contact form capture plus tests and admin/API output. | AGPL-3.0; native model/migration scope needs maintainer approval. |
| 4 | [LibreBooking/librebooking](https://github.com/LibreBooking/librebooking) | Score 100; PHP booking lifecycle; active plugin system with post-reservation hooks and custom attributes. About 791 stars; active; plugin docs and contribution guide present. **Verified.** | Propose an optional post-reservation integration/plugin that reads approved custom attributes and emits a deduplicated conversion event. Keep core booking tables unchanged if the plugin API allows it. | GPL-3.0; plugin API is documented as unstable. |
| 5 | [bpmn-io/form-js](https://github.com/bpmn-io/form-js) | Score 97; modern form runtime with a clear extension/event surface. | Add an external integration example for allowlisted hidden attribution fields and submit mapping. Only add a core hook if the existing event contract cannot support the recipe. | Verify current contribution policy and license before contact. |
| 6 | [craue/CraueFormFlowBundle](https://github.com/craue/CraueFormFlowBundle) | Score 96; PHP/Symfony multi-step forms are a natural first-touch/last-touch handoff surface. | Add a Symfony recipe or optional bridge that preserves attribution across form steps and exposes it on final submission. | Verify current activity and supported Symfony versions. |
| 7 | [svecosystem/formsnap](https://github.com/svecosystem/formsnap) | Score 100; Svelte/SvelteKit distribution path matches the ClickTrail adapter work. | Add a SvelteKit example using `@vizuh/clicktrail-sveltekit` and hidden-field injection, with no Formsnap runtime dependency. | Reverify current repository state; API request was rate-limited during planning. |
| 8 | [vueform/builder](https://github.com/vueform/builder) | Score 100; strong form-builder visibility. | Propose an external ClickTrail example around rendered forms and submit serialization. | `LICENSE.txt` and the license agreement need legal review before a native PR. |

### Wave 2 — high visibility, higher integration cost

| Repository | Contribution shape | Gate before coding |
|---|---|---|
| [pdovhomilja/nextcrm-app](https://github.com/pdovhomilja/nextcrm-app) | Optional attribution metadata on lead/contact/opportunity creation, with Prisma migration only after maintainer approval. | Large Next.js 16/Postgres app; Node 22+, database setup, E2E checks. About 683 stars; active; contribution guide present. **Verified.** |
| [directus-labs/agency-os](https://github.com/directus-labs/agency-os) | Directus collection fields/flows or a recipe, not a Nuxt core patch. | Strong fit, but the default branch checkout ends at 2025-03-26 while the repository-level API activity was later; reverify which ref is active before contact. About 969 stars. **Verified with a freshness caveat.** |
| [w3bdesign/nextjs-woocommerce](https://github.com/w3bdesign/nextjs-woocommerce) | Next.js/WooCommerce checkout example with server-side conversion handoff. | Verify current activity, license, checkout boundaries, and whether the repo accepts integrations. |
| [store-craft/storecraft](https://github.com/store-craft/storecraft) | Provider-neutral order metadata and ClickTrail JS/Node conversion example. | Verify API and extension points; do not assume the supplied score is current. |
| [ChurchCRM/CRM](https://github.com/ChurchCRM/CRM) | Optional attribution fields on lead/contact creation and outbound API/webhook representation. | PHP/CRM fit is strong, but inspect extension and license policy before model changes. |
| [itflow-org/itflow](https://github.com/itflow-org/itflow) | Client/ticket/invoice acquisition metadata through an optional module or recipe. | Verify current API and contribution path. Avoid broad CRM schema changes. |
| [phpList/phplist3](https://github.com/phpList/phplist3) | Allowlisted acquisition source on subscriber signup and automation payloads. | Verify current stack, event hooks, and privacy policy. |

### Wave 3 — watchlist and ecosystem recipes

These are useful after one or two accepted contributions establish a repeatable
pattern:

- [OpenCATS/OpenCATS](https://github.com/opencats/OpenCATS) — applicant source
  metadata; prefer an adapter or recipe.
- [KoalixSwitzerland/koalixcrm](https://github.com/KoalixSwitzerland/koalixcrm) —
  Django CRM integration after Wave 1 proves the model.
- [etewiah/property_web_builder](https://github.com/etewiah/property_web_builder)
  — property-lead attribution; Ruby adapter or recipe.
- [roots/acorn](https://github.com/roots/acorn) — Laravel/WordPress developer
  visibility; docs or package recipe, not an automatic WordPress mutation.
- [webreinvent/vaahcms](https://github.com/webreinvent/vaahcms) and
  [marcantondahmen/automad](https://github.com/marcantondahmen/automad) —
  small PHP CMS integration opportunities.
- [bytechefhq/bytechef](https://github.com/bytechefhq/bytechef) and
  [wexflow](https://github.com/aelassas/wexflow) — connector/action recipes after
  the event contract and server package are public.
- [fullcalendar/fullcalendar-workspace](https://github.com/fullcalendar/fullcalendar-workspace)
  — example-only instrumentation; do not put attribution logic in a calendar
  library.

## Contribution map by ClickTrail surface

| Surface | Best targets | Shape |
|---|---|---|
| `@vizuh/clicktrail/browser` | OpenSalon, Formeo, Form.js, Formsnap, Vueform Builder | Consent-gated capture, hidden fields, submit mapping, no required dependency |
| `@vizuh/clicktrail-sveltekit` | Formsnap, OpenSalon, NextCRM | SvelteKit recipe or optional adapter; keep host routing and forms in control |
| `@vizuh/clicktrail-astro` / `@vizuh/clicktrail-nuxt` | AgencyOS, Nuxt/commerce targets | Page capture and first-party proxy recipe; no vendor endpoint hardcoding |
| ClickTrail PHP SDK | Aire, LibreBooking, ChurchCRM, ITFlow, phpList, Symfony Form Flow | Server-side conversion builders, idempotent event send, optional package/module |
| ClickTrail Python SDK | DjangoCRM, KoalixCRM | Django app/adapter or documented signal/form integration |
| Formbricks-style bridge | Form builders and survey systems | Explicit field allowlist and webhook verification; no answer or PII passthrough |
| Documentation only | Mature libraries and large targets | One accurate recipe before proposing a native hook |

## Reusable issue template

**Title:** Proposal: optional consent-aware attribution metadata for `<surface>`

**Body outline:**

1. Describe the user journey: ad click → landing page → `<lead/booking/order>`.
2. State that the proposal is provider-neutral and works without ClickTrail.
3. Name the smallest host-owned field or metadata extension point.
4. List the allowlisted fields and explicitly exclude PII and arbitrary payloads.
5. Explain consent, retention, and disabled-by-default behavior.
6. Offer a ClickTrail JS example as one optional adapter.
7. Ask whether maintainers prefer a docs recipe, adapter package, or native hook.
8. Offer tests and documentation, but wait for maintainer direction before
   opening a PR.

## PR acceptance checklist

- [ ] Maintainer confirmed the contribution shape.
- [ ] Fork and branch created; no third-party `main` push.
- [ ] License and supported runtime checked.
- [ ] No required ClickTrail dependency unless explicitly accepted.
- [ ] Consent-denied path tested.
- [ ] Allowlist rejects PII and arbitrary objects.
- [ ] Existing forms/bookings/orders work unchanged when disabled.
- [ ] Duplicate events have a stable idempotency key.
- [ ] Unit/integration tests and project CI pass.
- [ ] README includes setup, privacy boundary, and removal path.
- [ ] PR is draft until the maintainer confirms the API shape.

## Execution order

1. Finish the ClickTrail JS first-wave release gates and keep npm publication
   explicit. Do not pretend an unpublished package is generally installable.
2. OpenSalon issue #4 is posted. Recheck its maintainer response before coding.
3. Recheck Formeo and Aire activity, then submit at most one of their drafts.
4. Wait for direction. Do not build three competing unsolicited adapters.
5. Implement the smallest accepted proof, with tests and a runnable example.
6. Use the accepted proof to approach DjangoCRM and LibreBooking with evidence,
   not a generic tracking pitch.
7. Re-rank the remaining list after each accepted/rejected contribution and
   record the result beside the target.

## Outreach status

### Submitted

- [OpenSalon #4](https://github.com/clawnify/OpenSalon/issues/4)
- [Formeo #485](https://github.com/Draggable/formeo/issues/485)
- [Aire #153](https://github.com/glhd/aire/issues/153)
- [DjangoCRM #509](https://github.com/DjangoCRM/django-crm/issues/509)
- [LibreBooking #1664](https://github.com/LibreBooking/librebooking/issues/1664)
- [Craue Form Flow #433](https://github.com/craue/CraueFormFlowBundle/issues/433)
- [Formsnap #232](https://github.com/svecosystem/formsnap/issues/232)
- [NextCRM #305](https://github.com/pdovhomilja/nextcrm-app/issues/305)
- [Next.js WooCommerce #1831](https://github.com/w3bdesign/nextjs-woocommerce/issues/1831)
- [phpList #1140](https://github.com/phpList/phplist3/issues/1140)

### Deferred deliberately

- **form-js** — the open custom-events issue is not the same proposal; avoid
  hijacking it with an attribution request.
- **phpList** — issue #556 remains the outbound-link proposal; separate issue
  #1140 covers inbound signup attribution and an optional PHP/plugin bridge.
- **ITFlow** — community PRs are currently paused; use the project forum if the
  target is revisited.
- **StoreCraft** — custom license requires permission review before proposing a
  contribution.
- **AgencyOS** — default-branch freshness needs confirmation before contact.
- **Vueform Builder** — license terms need clarification before contribution.
- **ChurchCRM** — member-data privacy and product fit require a separate review.

## Batch 2 outreach

### Submitted

- [Easy!Appointments #1944](https://github.com/alextselegidis/easyappointments/issues/1944)
- [Django Appointment #484](https://github.com/adamspd/django-appointment/issues/484)
- [Relaticle #531](https://github.com/relaticle/relaticle/issues/531)
- [Frappe Appointment #345](https://github.com/rtCamp/frappe-appointment/issues/345)
- [Atomic CRM #351](https://github.com/marmelab/atomic-crm/issues/351)
- [Nimara #783](https://github.com/mirumee/nimara-ecommerce/issues/783)
- [Bagisto GraphQL API #590](https://github.com/bagisto/headless-ecommerce/issues/590)

### Existing threads joined

- [Krayin CRM #2046](https://github.com/krayin/laravel-crm/issues/2046) — narrowed
  the first phase to validated lead provenance.
- [IDURAR #1104](https://github.com/idurar/idurar-erp-crm/issues/1104) — proposed
  immutable source context first, with outcomes separate from later campaign
  dashboards and ROI.
- [Open Mercato #3211](https://github.com/open-mercato/open-mercato/issues/3211) —
  suggested a narrow provider-neutral provenance contract behind the existing
  Forms dependency.

HeyForm and Typebot's relevant threads were closed, so no comments were added to
revive or hijack them.

### Mechanical cleanup

- Removed accidental leading whitespace from public issue titles.
- Rechecked template-aligned headings and the LibreBooking replacement body.
- GitHub rejected label edits because the current account lacks label-management
  permission; no repository settings were changed.

### Deferred deliberately

- **Payload Appointments Plugin** — repository license metadata is absent; do
  not propose a contribution until the license is confirmed.
- **Comp AI CRM** — its contribution guide asks for a short human-written idea
  or ADR PR, not a long issue. A short note is prepared locally at
  `docs/oss-contributions/comp-ai-provenance-short-note.md` but was not posted.
- **Saleor Storefront** — current license restrictions make Nimara the cleaner
  Saleor ecosystem target.
- **Tymeslot** — privacy-led community discussion makes attribution a poor fit
  without explicit owner interest.
- **Thunderbird Appointment** — privacy-first positioning lowers fit for this
  outreach.
- **Open Mercato** — existing form-to-deals attribution roadmap makes a new
  discovery issue redundant.

## Current blockers

- ClickTrail npm first-publication provenance and trusted-publisher gates remain
  open.
- Several target-list star counts and activity states need rechecking before
  contact.
- The unauthenticated GitHub API rate limit was reached during this pass; the
  next verification pass should use authenticated read-only GitHub access or
  the repository web/clone path.
- No external issues or pull requests have been opened yet.
