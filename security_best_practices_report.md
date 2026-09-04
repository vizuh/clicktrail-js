VIZUH

# ClickTrail JS Blue-Team Security Review

Date: 2026-09-04
Scope: `clicktrail-js`, targeting `origin/release/0.1.0-rc.4` (`23c02be`)
Method: Daybreak risk council, source review, focused local reproductions, package tests, and live `pnpm audit --prod`.

## Executive summary

Four fail-closed defects were reproduced: two consent paths, credential-bearing HTTP transport, and reserved-field forgery through `__proto__`. A cyclic event could also poison the browser transport queue. All six findings below are fixed in the isolated worktree with focused regression tests. No committed secret was observed in reviewed package surfaces, and npm reported no known production dependency vulnerability.

## High

### CT-SEC-001 — Unknown Typebot consent becomes granted

- Rule: fail closed on unknown consent input.
- Location: `integrations/typebot/src/variables.ts:53-60` (`normalizeConsent`).
- Evidence: `pending` and `declined` both normalized to `granted`.
- Impact: malformed or localized denial text can emit a false consent grant.
- Fix: return no state unless value matches the explicit allowlist.
- Status: fixed at `variables.ts:53-59`; regression at `tests/variable-mapping.test.ts:49-50`.
- Mitigation: hosts should still pass canonical consent values.
- False positive notes: none; failure was reproduced from the exported function.

### CT-SEC-002 — Missing purpose consent becomes granted

- Rule: purpose-level consent must be explicit.
- Location: `packages/consent/src/gates.ts:27-35`; duplicated Qwik gate at `integrations/qwik/src/consent.ts:66-73`.
- Evidence: `{ state: 'granted' }` allowed both analytics and advertising despite `types.ts:8` defining absent as unknown and denied.
- Impact: a general grant can transmit data for a purpose the user did not approve.
- Fix: require the requested purpose flag to equal `true`.
- Status: fixed at `gates.ts:27-34` and Qwik `consent.ts:66-72`.
- Mitigation: hosts must provide explicit purpose flags from their CMP.
- False positive notes: none; implementation contradicted its documented type contract.

### CT-SEC-003 — Typebot sends API key over HTTP

- Rule: credentials must not cross cleartext transport.
- Location: `integrations/typebot/src/config.ts:46-59`; `integrations/typebot/src/send.ts:54-60`.
- Evidence: an `http://` endpoint resolved successfully and the request contained the key header.
- Impact: network observers can capture the collector credential and event payload.
- Fix: reject absolute HTTP endpoints; keep root-relative development proxies valid.
- Status: fixed at `config.ts:46-61`; the fix rejects all absolute cleartext endpoints because event bodies may contain PII even without a key.
- Mitigation: same-origin root-relative proxies remain available for local development.
- False positive notes: none; the injected fetch seam observed the key header on HTTP.

### CT-SEC-004 — Reserved-field sanitizer permits `__proto__` forgery

- Rule: attacker-controlled server event input must not alter routing or canonical metadata.
- Location: `packages/browser/src/browser/serialize.ts:60-76,179-189`.
- Evidence: JSON-owned `__proto__` survived sanitization; `Object.assign` then exposed forged `site_id` and `source` in `marketing_trail`.
- Impact: untrusted event data can falsify attribution or tenant metadata inside the canonical envelope.
- Fix: remove `__proto__` at the shared sanitizer used by all server adapters.
- Status: fixed at `serialize.ts:60-77`; regression at `browser-serialize.test.ts:26`.
- Mitigation: server adapters should keep tenant identity in trusted constructor config.
- False positive notes: global `Object.prototype` was not polluted, but nested canonical metadata was forged.

## Medium

### CT-SEC-005 — Apointoo outcome destination accepts HTTP

- Rule: outcome and bearer-token transport must use TLS.
- Location: `packages/clicktrail/src/apointoo/destination.ts:125-193`.
- Evidence: configured endpoint reaches the fetch seam without protocol validation; optional authorization is attached before delivery.
- Impact: outcome data and scoped bearer credentials can cross cleartext transport.
- Fix: require an absolute HTTPS destination during construction.
- Status: fixed at `destination.ts:126-131` using the existing public-HTTPS validator.
- Mitigation: deployments should retain outbound allowlists against DNS rebinding.
- False positive notes: endpoint is host-configured, so exploitability depends on configuration control; confidentiality failure was still deterministic.

### CT-SEC-006 — Cyclic event poisons browser transport flush

- Rule: analytics failure must not escape or permanently block later batches.
- Location: `packages/browser/src/browser/transport.ts:74-89`.
- Evidence: `JSON.stringify` runs before the error boundary and before clearing the batch.
- Impact: one host-supplied cyclic value rejects `flush()` and leaves the queue unsendable.
- Fix: detach the batch first and serialize inside the existing drop/error boundary.
- Status: fixed at `transport.ts:74-89`; regression at `browser-http-destination.test.ts:98` proves recovery on the next batch.
- Mitigation: hosts should keep event properties JSON-compatible.
- False positive notes: availability impact requires a cyclic host value; no remote input path was assumed.

## Deferred design risks

- Typebot runs in the browser, so its `apiKey` option cannot protect a long-lived secret even over HTTPS. Treat it only as a public/scoped credential or route through the default same-origin backend proxy; removing the option is a public API decision.
- Cross-domain continuation data is readable in a query parameter and reaches browser/server logs before client-side removal (`packages/browser/src/browser/link-decoration.ts`). Changing query transport to fragment or opaque server state is a compatibility decision.
- Default form injection targets every form and includes click/visitor/session identifiers (`packages/browser/src/browser/form-injection.ts`). Restricting by action origin or selector needs a documented host contract.
- Django `ct_vid` creation has no consent input, but the adapter does not currently expose a consent contract; adding one is an API change.
- Directus saved settings are documented as dashboard-only; runtime remains environment-owned, so its UI toggle is not treated as an enforcement bypass.

## Negative evidence

- `pnpm audit --prod`: `No known vulnerabilities found` on 2026-09-04.
- `@vizuh/clicktrail-server`: 20/20 tests passed after dependency build; stale ignored `dist` is a build-order/release gate, not confirmed shipped exposure.
- Reviewed package manifests use explicit file allowlists; no packaged secret leak was observed.

## Verification

- Focused suites: Typebot 33/33, consent 6/6, Qwik 49/49, browser 166/166, ClickTrail 134/134.
- `pnpm typecheck`: passed.
- `pnpm test`: passed across 14 workspace projects.
- `pnpm build`: passed across 14 workspace projects.
- `pnpm probe`: 12/12 fixtures passed after rerun outside the sandbox to permit its temporary localhost listener.
