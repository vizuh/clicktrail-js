# Upstream issue draft — official "Send event to ClickTrail" block

> Ready-to-post issue for `baptisteArno/typebot.io` (or the current canonical typebot repo).
> Title suggestion: **[Block proposal] Send event to ClickTrail — conversational lead attribution**

---

## Summary

Typebot users capture leads conversationally. [ClickTrail](https://github.com/vizuh/clicktrail-js) attaches ad-click attribution (UTM + click IDs like `gclid`) to those leads and records conversions first-party — no third-party pixels, GDPR-friendly.

We propose an official **"Send event to ClickTrail"** block that lets bot creators attribute conversations without writing code: map standard Typebot variables onto canonical ClickTrail fields and emit one of eight events.

## Why a native block

- Today users must hand-write `fetch` payloads in Code steps (error-prone, invisible in the flow editor).
- A native block shows the event + variable mapping visually, exactly like existing analytics integrations.
- The underlying logic is small and dependency-free: variable mapping, one envelope builder, one HTTP call.

## Proposed options schema

Mirrors `packages/typebot-block/src/config.ts` in [`vizuh/clicktrail-js`](https://github.com/vizuh/clicktrail-js/tree/main/packages/typebot-block):

| Option | Type | Required | Notes |
|---|---|---|---|
| Action | enum | yes | Identify Visitor · Form Started · Lead Submitted · Qualified Lead · Appointment Requested · Purchase · Update Consent · Attach Variables |
| Endpoint | string | yes | default `/api/clicktrail`; relative or absolute http(s) |
| Site ID | string | no | |
| Workspace ID | string | no | |
| API key | string | no | sent as `X-ClickTrail-Key` header |

Per-action inputs (all mappable to Typebot variables): `Email`, `Phone`, `Lead ID` (required for Qualified Lead), `utm_campaign`, `gclid`, `Quoted value`, `Marketing consent`, plus Purchase-specific `Transaction ID` / `Value` / `Currency` (required), and arbitrary extra properties (JSON).

## Variable-mapping table

| Typebot variable | Canonical ClickTrail field |
|---|---|
| `{{Email}}` | `email` |
| `{{Phone}}` | `phone` |
| `{{Lead ID}}` | `lead_id` |
| `{{utm_campaign}}` | `campaign` |
| `{{gclid}}` | `gclid` (click id) |
| `{{Quoted value}}` | `value` |
| `{{Marketing consent}}` | `consent_state`: `granted` / `withdrawn` / `policy_updated` |

## Event names

Identify → `lead` · Form Started → `form.started` · Lead Submitted → `form.submitted` · Qualified Lead → `lead.qualified` · Appointment Requested → `appointment.requested` · Purchase → `sale.recorded` · Consent → `consent.granted` / `consent.withdrawn` / `consent.policy_updated`.

Wire shape: `POST {endpoint}` with `{ events: [{ schema_version: 1, event_name, occurred_at, ...mappedFields }] }`.

## v1 scope

Trigger-free: the block does nothing until explicitly placed in a flow — no automatic page-view tracking, no cookies set by the block itself, no hidden requests. Consent handling is explicit via the Update Consent action. Required-field violations throw `TypeError('<action>.<field>')` at execution time so misconfigurations are visible in logs; network failures resolve `{ ok: false }` and never break the conversation.

Out of scope for v1: server-side verification UI, response parsing into flow variables (can be added later via `Set variable` integration).

## Implementation note

A working reference implementation exists (`@vizuh/clicktrail-typebot`, MIT): pure `(mappedVariables, config) -> event` builders, injected send/clock, vitest-covered. Lifting it into `packages/blocks/clicktrail/` means swapping the plain config object for `option` helpers and registering the typed block schema — no logic changes expected.

Happy to open the PR against `main` once the maintainers confirm interest and the preferred package naming (`@typebot.io/clicktrail`?).
