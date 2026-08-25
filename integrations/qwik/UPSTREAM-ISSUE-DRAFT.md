# UPSTREAM-ISSUE-DRAFT.md

Proposal text for filing with the Qwik repos. Per the Qwik "Adding A New Integration"
route, this goes in as an ISSUE first; a PR follows only after maintainer direction.

> **Title:** New ecosystem integration proposal: `@vizuh/clicktrail-qwik` — consent-aware first-party attribution that preserves resumability
>
> **Summary**
>
> We maintain [ClickTrail](https://github.com/vizuh/clicktrail-js), a first-party attribution /
> conversion-tracking SDK (MIT). We built a Qwik + Qwik City integration designed around one
> constraint: **do not break resumability**.
>
> **Design highlights**
>
> - **No inline analytics script dump.** Initial attribution (UTMs, click IDs, external referrer)
>   is parsed by a Qwik City middleware in ordinary SSR code — zero added client JS.
> - **Request-local identity.** Captured attribution lands in the request `sharedMap`;
>   route loaders/actions attach it to conversions. A first-party `attribution` cookie carries
>   history across requests, written only when the shared `ct_consent` cookie grants.
> - **Server-side conversions preferred.** `trackLead / trackBooking / trackPurchase` send from
>   route actions; the browser SDK is strictly optional and activated on demand
>   (e.g. `useVisibleTask$` after consent).
> - **Structural seams, zero framework imports at runtime.** The package builds without
>   `@builder.io/qwik` / `qwik-city` installed; peer deps are optional metadata. This keeps the
>   package testable in isolation and resilient to framework version churn.
> - **Consent-aware by construction.** Cookie-backed consent state shared between SSR and client
>   (no hydration drift); pre-consent operation is memory-only.
>
> **Ask**
>
> 1. Is this a fit for the Qwik ecosystem catalog (`npm run qwik add`)?
> 2. If yes, which repo should carry the entry (qwik-modules registry vs. per-package metadata),
>    and do you want any naming/config conventions followed?
> 3. Any objection to the structural-seam approach (no direct `@builder.io/*` imports), or would
>    you prefer thin typed wrappers once accepted?
>
> **Links**
>
> - Package source: https://github.com/vizuh/clicktrail-js/tree/main/integrations/qwik
> - Core monorepo: https://github.com/vizuh/clicktrail-js
>
> Happy to adjust the design per maintainer feedback before any PR.
