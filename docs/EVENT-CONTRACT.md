# ClickTrail Canonical Event Contract

Status: AUTHORITATIVE for all integrations from v0.2 onward.
Supersedes ad-hoc event names used by pre-0.2 integration scaffolds.

## Principle

Every integration (Astro, Nuxt, n8n, Activepieces, Typebot, Formbricks, Directus,
Cal.com, Strapi, GTM templates, RudderStack, Segment) produces THE SAME small set of
canonical events through ONE shared library layer. No integration invents its own
schema. Platform code translates inputs -> shared builders -> wire format.

## Package layering (extraction target)

| Package | Owns |
|---|---|
| `@vizuh/clicktrail-core` | Event schemas, validation, event ID generation, idempotency helpers, retry classification, API client, TS types |
| `@vizuh/clicktrail-browser` | URL/UTM parsing, click-ID capture, ft_/lt_ attribution merge, session management, SPA navigation tracking, consent-aware event queue |
| `@vizuh/clicktrail-server` | Server ingestion client, batching, lead/contact identification, booking/revenue/offline-conversion/refund events, idempotency keys |
| `@vizuh/clicktrail-consent` | Consent state types, CMP adapters, update listeners, storage/transmission gates, source + policy-version metadata, withdrawal handling |
| `@vizuh/clicktrail-core` (attribution surface) | Pure parse/classify/merge engine (today's frozen core) |
| `clicktrail-js` test and parity tooling | Golden fixtures, replay harness, parity tools |

`integrations/` holds platform adapters; `templates/` holds GTM gallery templates.
During migration `@vizuh/clicktrail` keeps its current subpath exports as shims.

## Canonical event names

page_view, form_started, lead_created, lead_qualified, booking_created,
booking_completed, sale, refund, consent_updated

Migration mapping from pre-0.2 scaffold names:

| Pre-0.2 | Canonical |
|---|---|
| lead / lead.submitted / form.submitted | lead_created (+ form_started where a distinct step exists) |
| lead.attribution_attached | lead_created with `attribution_attached: true` detail |
| lead.stage_updated | lead_updated (detail.stage) — pending ruling, see below |
| lead.merged | lead_merged with merged identity ids |
| visitor.anonymized | visitor_anonymized — deletion request; collector erasure support is separate |
| booking / appointment.booked / appointment.requested | booking_created |
| appointment.attended / appointment.completed | booking_completed |
| sale.completed / sale.recorded / purchase | sale |
| sale.refunded / refund.issued | refund |
| offline_conversion.sent | sale (detail.kind='offline') |
| consent.granted/withdrawn/policy_updated | consent_updated (state/source/version fields) |

Lead stage changes, visitor merges, and visitor anonymization are not in the
canonical nine. Keep them as `lead_updated`, `lead_merged`, and
`visitor_anonymized` EXTENSION events that integrations may emit but consumers
must not require.

Legacy names remain valid inputs during migration. Shared serializers must
normalize them before delivery; new code and documentation use only canonical
names. Unknown custom names pass through for host-defined events but never
replace the nine predefined ClickTrail facts.

## OpenTelemetry signal mapping

ClickTrail events are point-in-time facts, so `/otel` maps each delivery to one
OpenTelemetry EventRecord through an injected Logger-like sink:

- `eventName`: `clicktrail.<canonical_event_name>`, for example
  `clicktrail.sale`;
- `timestamp`: canonical `occurred_at`, then adapter `event_time`, when valid;
- default attributes: ClickTrail event/schema/classifier versions plus explicit
  journey, conversation, message, and agent correlation IDs;
- attribution URLs, click IDs, arbitrary dotted fields, and PII are not copied;
  hosts may add reviewed scalar attributes through the mapping callback;
- the host owns active trace context, sampling, processors, and export.

The destination never creates a span or synthetic `traceparent`. Spans remain
appropriate for real operations with duration. Explicit trace-context helpers
stay available for non-OTel correlation migrations, outside destination flow.

## Required field vocabulary

Canonical superset (events carry a subset; never invent sibling spellings):
event_id, event_name, occurred_at, site_id, workspace_id, visitor_id, session_id,
lead_id, contact_id, booking_id, order_id, value, currency, landing_url, referrer,
utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, gbraid,
wbraid, fbclid, msclkid, consent_state, consent_source, consent_version.

Rules:
- snake_case everywhere on the wire. Platform-native casing lives only inside
  adapter inputs.
- `marketing_trail` envelope stays attached (ids, latest-touch-with-first-touch-
  fallback, click_ids map, consent, form context) — additive, never required by
  consumers.
- Money fields: positive finite numbers + ISO-4217 currency; refunds carry
  positive value + `refund_of: <original event_id|transactionId>`.
- Unknown extra properties allowed under `properties` bag; PII only via explicit
  host mapping (see policy below).

## Idempotency (non-negotiable backend property)

- Every event carries `event_id` (prefixed UUIDv4-style, `evt_`), generated by
  `@vizuh/clicktrail-core` id generation — never by the platform.
- Retryable senders MUST reuse the same event_id across retries of the same
  logical occurrence (n8n retry, webhook redelivery, double booking callback).
- Collectors MUST treat duplicate event_id within the retention window as
  success-no-op (at-most-once delivery semantics end-to-end).
- `@vizuh/clicktrail-core` ships an idempotency helper: deterministic derivation
  `(site_id, external_key)` -> stable event_id for server replays, e.g. booking
  system callbacks keyed by `${booking_id}:${stage}`. JS and Python use the
  `sha256-128-v1` contract: UTF-8 encode `site_id + U+0000 + external_key`, take
  the first 16 SHA-256 bytes, lowercase hex, and prefix `evt_s-`. Golden vectors
  live in `fixtures/stable-event-id-v1.json`.
- Tenant adapters must resolve tenant identity from trusted server configuration,
  never from incoming model or webhook data. Their stable key should include the
  tenant, adapter, canonical event name, and provider event ID.
- Adapter-specific fields belong under `properties`; tenant metadata may be
  copied there for routing and audit without becoming a new canonical field.

## Integration policy (what gets submissions rejected)

Binding for every package and PR we submit anywhere:

1. No tracking by default: install alone transmits NOTHING; activation requires
   explicit configuration by the administrator.
2. No self-telemetry: no install counts, URLs, environment data, or error reports
   sent to Vizuh unless diagnostics are explicitly enabled.
3. No non-essential persistence before the consent gate: pre-consent operation is
   in-memory or fully inactive.
4. No PII by default: email/phone/name require explicit host-side field mapping.
5. No fingerprinting: first-party IDs, campaign identifiers, explicit form IDs,
   server records only.
6. No bundled commercial dependency that cannot be disabled; network destination
   always configurable.
7. Consent handling is recording + respecting, never CMP replacement claims.
8. First PRs stay small: one focused action/adapter + tests + docs.
9. Ownership clarity in every README: maintainer, support contact, release
   policy, compatibility range, public issue tracker.
10. Secrets never embedded in extensions/packages; configuration only.

## Submission ladder (order matters)

WordPress plugin -> GTM Community Template Gallery (templates/) -> Astro + Nuxt
-> n8n verification -> Activepieces piece -> Typebot block proposal -> Cal.com
Attribution app -> Directus + Strapi -> RudderStack -> Segment (post commercial
support model).
