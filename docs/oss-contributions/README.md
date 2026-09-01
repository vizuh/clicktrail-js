# OSS contribution record

This directory records provider-neutral attribution proposals sent to upstream
projects. These are contribution records, not ClickTrail dependencies or claims
that an upstream project has adopted the proposal.

## Operating boundary

ClickTrail can provide an optional adapter for an upstream application, but the
upstream project owns its product decision and data boundary. A proposal should
not make attribution a required dependency, collect PII or raw requests, or use
browser-supplied values for authorization, pricing, eligibility, workflow, or
fraud decisions. The host owns consent, retention, access control, and delivery.

A proposal is not a reason to close an upstream issue automatically. Maintainers
own issue state and may prefer a custom integration, a documentation recipe, a
native admin surface, or no change.

## Verified status

Status checked against the GitHub API on **2026-09-01**.

| Record | Upstream | Status and ClickTrail-relevant outcome |
|---|---|---|
| [Aire](./aire-attribution-recipe-issue.md) | [#153](https://github.com/glhd/aire/issues/153) | Open; optional host-owned recipe proposed. |
| [Atomic CRM](./atomic-crm-provenance-issue.md) | [#351](https://github.com/marmelab/atomic-crm/issues/351) | Closed; maintainer says notes or custom fields already cover the need. No core change needed. |
| [Bagisto](./bagisto-cart-order-context-issue.md) | [#590](https://github.com/bagisto/headless-ecommerce/issues/590) | Open; asks for the safest cart-to-order extension boundary. |
| [Craue FormFlow](./craue-formflow-attribution-issue.md) | [#433](https://github.com/craue/CraueFormFlowBundle/issues/433) | Open; documentation or recipe remains the smallest option. |
| [Django Appointment](./django-appointment-booking-metadata-issue.md) | [#484](https://github.com/adamspd/django-appointment/issues/484) | Open; no maintainer response yet. |
| [DjangoCRM](./django-crm-attribution-issue.md) | [#509](https://github.com/DjangoCRM/django-crm/issues/509) and [PR #510](https://github.com/DjangoCRM/django-crm/pull/510) | Open; maintainer requested a native Django Admin implementation without third-party applications. See [Django questions](./django-questions.md). |
| [Easy!Appointments](./easyappointments-acquisition-context-issue.md) | [#1944](https://github.com/alextselegidis/easyappointments/issues/1944) | Closed; maintainer prefers a custom integration and does not need a core field. |
| [Formeo](./formeo-attribution-example-issue.md) | [#485](https://github.com/Draggable/formeo/issues/485) | Open; documentation-first example proposed. |
| [Formsnap](./formsnap-attribution-example-issue.md) | [#232](https://github.com/svecosystem/formsnap/issues/232) | Open; optional Svelte form recipe proposed. |
| [Frappe Appointment](./frappe-appointment-extension-issue.md) | [#345](https://github.com/rtCamp/frappe-appointment/issues/345) | Open; asks maintainers to identify a validated extension point. |
| [LibreBooking](./librebooking-attribution-issue.md) | [#1663](https://github.com/LibreBooking/librebooking/issues/1663), reposted as [#1664](https://github.com/LibreBooking/librebooking/issues/1664) | Original closed for missing template; repost open with the required feature sections. |
| [NextCRM](./nextcrm-attribution-issue.md) | [#305](https://github.com/pdovhomilja/nextcrm-app/issues/305) | Open; native migration and permission impact called out before implementation. |
| [Next.js WooCommerce](./nextjs-woocommerce-attribution-issue.md) | [#1831](https://github.com/w3bdesign/nextjs-woocommerce/issues/1831) | Deleted upstream; retain the draft as historical evidence only. |
| [Nimara](./nimara-checkout-context-issue.md) | [#783](https://github.com/mirumee/nimara-ecommerce/issues/783) | Open; asks for a documented checkout metadata path. |
| [OpenSalon](./opensalon-attribution-metadata-issue.md) | [#4](https://github.com/clawnify/OpenSalon/issues/4) | Open; optional appointment metadata and authorization rules proposed. |
| [phpList](./phplist-php-attribution-issue.md) | [#1140](https://github.com/phpList/phplist3/issues/1140) | Open; explicitly separated from outbound-link tracking issue #556. |
| [Relaticle](./relaticle-provenance-issue.md) | [#531](https://github.com/relaticle/relaticle/issues/531) | Closed because ideas belong in Discussions; the recorded discussion link currently returns 404 from the API. |
| [Comp AI](./comp-ai-provenance-short-note.md) | Project guidance | Short idea note only; do not post as a generated long issue. |

## ClickTrail-owned issue references

- [WordPress handler #44](https://github.com/vizuh/click-trail-handler/issues/44)
  is closed. ClickTrail documented that the observed `Direct` result was
  consent-suppressed attribution, not a capture defect; the diagnostic now
  explains the checkout-time consent snapshot.
- [ClickTrail JS #13](https://github.com/vizuh/clicktrail-js/issues/13) remains
  open. It tracks a possible Cal.com Attribution app and is not implied by the
  upstream proposals in this directory.

## Site documentation boundary

A broader site-facing edge-case guide is intentionally deferred. When that work
starts, derive it from verified ClickTrail contracts and upstream feedback,
including consent denied or withdrawn, absent or malformed attribution,
cache-first landing pages, dynamic forms, booking-request-to-confirmation
lifecycles, authorization-limited admin/API views, failed optional delivery, and
unknown or oversized fields. Do not turn this contribution log into product
claims or a provider/compliance certification.
