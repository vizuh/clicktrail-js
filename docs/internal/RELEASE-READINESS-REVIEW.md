# ClickTrail JS Release Readiness Review

Date: 2026-08-24
Reviewed baseline: current release-candidate worktree; follow-up fixes applied after review
Packages: `@vizuh/clicktrail@0.1.0-rc.2`, `@clicktrail/astro@0.1.0-rc.2`
Scope: clean installation, package exports, runtime compatibility, browser and
Node behavior, CI/release workflow, supply-chain checks, privacy boundaries,
enterprise integration, and AI workflow safety.

## Executive result

The core and Astro packages build, test, and install from clean release
tarballs. The provenance audit and live WP parity differences remain explicit
release boundaries; neither is described as closed by local source tests.

The original release blockers were:

1. `/agent` and `/conversation` claim metadata-only/content-safe behavior, but
   unrestricted `extra` objects allow prompts, completions, transcripts, and
   PII to enter emitted events.
2. Cross-domain defaults silently fail across separate origins unless hosts
   provision shared signing state or inject matching `sign`/`verify` functions.
3. The WP parity enforcement path is documented but cannot be dispatched from
   the current CI workflow.
4. The provenance audit still records unresolved MIT publication conditions
   B1-B4.

`AI-001`, `XDOM-001`, and `REL-001` are resolved in the follow-up patch.
`GOV-001` remains a publication governance risk. The package may be published
only under the owner's explicit decision to accept that unresolved provenance
gate; this report does not invent the missing attestations.

## Gate matrix

Owners below are execution owners; Hugo retains publication and governance
decisions.

| Gate | Status | Owner | Required proof | Permitted target |
| --- | --- | --- | --- | --- |
| `AI-001` | Closed in follow-up | Codex | Full suite plus regression tests exclude prompts, completions, transcripts, and content from emitted events | Technical readiness only |
| `XDOM-001` | Closed in follow-up | Codex | Cross-domain sign/verify test and browser probe pass | JS release candidate, not stable publication by itself |
| `REL-001` | Closed in follow-up | Codex | Dispatchable CI parity workflow and recorded run | Release evidence when parity input is available |
| `REL-002` | Closed in follow-up | Codex | Sender failure and dropped-batch behavior remain covered by tests | Technical readiness only |
| `PRIV-001` | Closed in follow-up | Codex | Cookie defaults and HTTPS `Secure` behavior verified at host edge | Technical readiness only |
| `API-001` | Closed in documentation | Codex | Node 18/20/22 import matrix and explicit ESM-only contract | JS release candidate |
| `DOC-001` | Closed | Codex | README, subpath, version-stamp, and workflow claims match shipped behavior | JS release candidate |
| `GOV-001` | Open | Hugo | Owner attestations close provenance audit items B1-B4 | No npm publication or `latest` tag |
| WP parity | Open: 25 unruled differences | Codex | Resolve or explicitly scope differences before claiming field parity or swapping runtimes | No parity claim; SVN submission remains separately gated |

Publication targets remain conditional: plugin GitHub release, JS
`0.1.0-rc.2` GitHub release, npm `next`, and WordPress.org SVN submission each
require their own reviewed evidence. A GitHub release does not prove npm
publication or WordPress.org indexing.

## Verified passes

- Local `pnpm test`: 39 files, 351 tests passed across core and Astro.
- Local `pnpm build`: passed.
- Local browser probe: 12/12 fixtures passed.
- GitHub CI run [32757188605](https://github.com/vizuh/clicktrail-js/actions/runs/32757188605): Node 20 and 22 verification passed; browser probe and pack smoke passed. WP parity was skipped because the sibling checkout was absent.
- Clean tarball install: `npm install` succeeded from `vizuh-clicktrail-0.1.0.tgz`.
- All seven published subpaths imported successfully from the installed tarball:
  `.`, `/browser`, `/conversation`, `/agent`, `/otel`, `/apointoo`, and
  `/incubating`.
- Built ESM subpaths imported successfully on Node `v18.20.8`.
- `pnpm audit --prod --audit-level high`: no known production dependency
  vulnerabilities.
- Release-candidate `pnpm test`: 39 files, 351 tests passed; strict typecheck,
  build, Chromium and Firefox probes (12/12 each), production audit, and
  clean-room pack smoke for both packages passed.
- Follow-up local WP parity run: 0 harness errors, but 25 unruled differences
  remain in the generated `tools/wp-runtime/PARITY-RUN.md`; this is not a
  claim of field-for-field plugin parity.
- Tarball dry-run: 152 files, limited to `LICENSE`, `README.md`,
  `package.json`, and `dist/` contents. No source, fixtures, tools, or
  credentials were included.
- Static scan found no `innerHTML`, `document.write`, `eval`, `new Function`,
  or string event-handler sinks in package source.
- The package has no runtime dependencies, uses strict TypeScript settings,
  and exposes declaration files for every exported subpath.

## Findings

### AI-001

Status: **fixed**. Unrestricted `extra` was removed from `/agent` and
`/conversation`; regression tests assert that content-shaped keys are absent.

- Severity: **High, release blocker**
- Rule: AI content must not enter a metadata-only event contract through an
  alternate input path.
- Location: `packages/clicktrail/src/agent/recorder.ts:82-83,98-99,180-186,219-228`; `packages/clicktrail/src/conversation/tracker.ts:96-97,165-182`.
- Evidence:

  ```ts
  const data: Record<string, unknown> = { ...(input.extra ?? {}) };
  ```

  The agent and conversation contracts then emit `data` without filtering the
  arbitrary keys.
- Reproduction: `buildAgentRunStarted({ ..., extra: { prompt: '...', completion: '...' } }, ...)` emitted both keys. A conversation event with `extra.transcript` emitted the raw transcript. This was reproduced against the built package during this review.
- Impact: an integration can accidentally store or deliver prompts,
  completions, transcripts, credentials, or personal data while the public
  comments promise that those values are never captured.
- Fix: remove unrestricted `extra` from these AI-facing APIs, or replace it
  with a strict, flat, bounded metadata allowlist. Add regression tests proving
  `prompt`, `completion`, `messages`, `transcript`, `content`, `input`, and
  `output` cannot be emitted through any field.
- Mitigation: until fixed, do not pass user/model content to `extra`; keep
  `/agent` and `/conversation` out of production AI workflows.
- False positive notes: `extra` is caller-controlled, so the issue is not an
  automatic data capture on every install. It is still a contract bypass and
  must be fixed before advertising the privacy guarantee.

### XDOM-001

Status: **fixed**. Default cross-domain signing now fails closed without
persistent storage; explicit matching `sign` and `verify` functions remain the
supported externally-provisioned path.

- Severity: **High, release blocker for cross-domain use**
- Rule: a default integrity mechanism must either work across its documented
  trust boundary or fail closed with an actionable configuration error.
- Location: `packages/clicktrail/src/browser/create-clicktrail.ts:323-331`; `packages/clicktrail/src/browser/link-decoration.ts:579-590,599-647`.
- Evidence: `createClickTrail` builds the default signer/verifier from the
  current instance's adapters. With no `storage`, the adapter list is empty;
  the signer creates a fresh key but cannot persist it, while the verifier has
  no key to load. Across separate origins, each origin also has separate
  browser storage unless the host explicitly provisions shared state.
- Impact: approved-domain link decoration can produce tokens that the landing
  site cannot validate. Attribution continuity then silently becomes
  `invalid_bad_signature` or no-op, which is unacceptable for an enterprise
  attribution contract.
- Fix: require `storage` when default signing is selected, and document one
  supported cross-origin provisioning pattern: shared cookie domain/key or
  explicit host-provided `sign` and `verify`. Add a two-origin integration test.
- Mitigation: use explicit `sign`/`verify` functions and test both origins
  before enabling `crossDomain`.
- False positive notes: same-origin and deliberately shared-cookie setups may
  work. The current API does not enforce or explain those prerequisites.

### REL-001

Status: **fixed**. CI now declares `workflow_dispatch`, checks out the pinned
public plugin revision when requested, and passes its path to the parity
harness.

- Severity: **Medium, release gate gap**
- Rule: a documented manual release gate must be executable.
- Location: `.github/workflows/ci.yml:3-7,101-105`.
- Evidence: the job references `inputs.require_parity`, and its summary tells
  maintainers to re-run with `workflow_dispatch`, but `workflow_dispatch` and
  its input are not declared in `on:`.
- Impact: maintainers cannot invoke the required parity mode from GitHub. The
  normal hosted run skips WP parity, so CI cannot currently prove parity before
  an npm release.
- Fix: add a `workflow_dispatch` input and checkout the public
  `vizuh/click-trail-handler` repository at a pinned ref, or remove the claim
  that parity can be enforced from this workflow. Keep the skip visible when
  the plugin checkout is intentionally unavailable.
- Mitigation: run `pnpm parity` in a workspace containing both repositories and
  attach the result to the release evidence.
- False positive notes: Node/test/build CI is green; this finding concerns only
  the unavailable parity gate.

### REL-002

Status: **fixed**. HTTP flush now awaits the sender and reports dropped batches
through `onDropped`; no retry policy was added.

- Severity: **Medium, enterprise reliability**
- Rule: a production transport must surface delivery failure and bound its
  failure behavior.
- Location: `packages/clicktrail/src/browser/transport.ts:39-54,69-74`.
- Evidence: the default `fetch` promise is discarded, and `send` failures are
  invoked through `void Promise.resolve(...)` without an error callback,
  retry policy, queue bound, or dropped-batch hook.
- Impact: network failures can become unhandled rejections or silent event
  loss. The generic HTTP destination has weaker failure evidence than the
  Apointoo destination, which exposes `onDropped` and retries.
- Fix: add an explicit bounded queue and `onDropped`/diagnostic callback, catch
  send failures, and document whether retries are intentionally delegated to
  the host.
- Mitigation: inject a sender owned by the host and monitor its failure path;
  do not treat `stop()` as proof that events reached the endpoint.
- False positive notes: the destination is intentionally thin and callers may
  accept at-most-once delivery. That tradeoff must be explicit for enterprise
  use.

### PRIV-001

Status: **fixed**. Cookie storage defaults to `Path=/; SameSite=Lax`; HTTPS
hosts still opt into `Secure` through `cookieAttrs`.

- Severity: **Medium, secure-default gap**
- Rule: browser persistence defaults should not depend on every consumer
  remembering baseline cookie policy.
- Location: `packages/clicktrail/src/browser/storage.ts:74-82,144-158`.
- Evidence: `CookieAttributes` are all optional and the default serializer can
  write cookies without `Path`, `SameSite`, or `Secure`.
- Impact: a default cookie can be scoped to the current path and may be sent in
  cross-site contexts. This is attribution data rather than an auth cookie,
  but it creates inconsistent enterprise privacy and retention behavior.
- Fix: default `path: '/'` and an appropriate `SameSite` value; make production
  HTTPS hosts opt into `Secure` through a documented preset or emit a clear
  configuration diagnostic when secure deployment is expected.
- Mitigation: require explicit `cookieAttrs` in production integration guides
  and verify the resulting `Set-Cookie` behavior at the host edge.
- False positive notes: forcing `Secure` unconditionally would break local
  HTTP development, so the final default needs an environment-aware contract.

### API-001

Status: **fixed in documentation**. The package remains intentionally ESM-only
and now states the Node/import contract and compatibility boundary.

- Severity: **Medium, compatibility/documentation gap**
- Rule: declared runtime support and module format must be explicit and tested.
- Location: `packages/clicktrail/package.json:6-13,59-60`; `packages/clicktrail/README.md:17-24`.
- Evidence: the package declares Node `>=18` and ESM-only exports, but the
  README does not say that CommonJS `require()` is unsupported. Node 18
  `require()` of the built entry point fails with `ERR_REQUIRE_ESM`.
- Impact: CommonJS enterprise services can install successfully and fail at
  runtime. Consumers also lack a clear browser/global-bundle entrypoint.
- Fix: either publish dual ESM/CJS exports with explicit `import` and
  `require` branches, or document ESM-only support prominently and add a
  compatibility matrix. Document how to consume the IIFE global bundle if it
  remains a supported integration.
- Mitigation: require ESM/NodeNext in consumer projects and test imports in a
  representative Node 18/20/22 matrix.
- False positive notes: ESM-only is a valid design choice; the issue is that it
  is not currently clear to normal consumers.

### DOC-001

Status: **fixed**. README and architecture docs now list all public subpaths,
stability, version stamps, browser transport behavior, and AI workflow rules.

- Severity: **Medium, release usability**
- Rule: published API documentation must describe every public entrypoint and
  match shipped behavior.
- Location: `packages/clicktrail/README.md:26-71`; `docs/ARCHITECTURE.md:48-59,80-88`.
- Evidence: the package exports `/browser`, `/conversation`, `/agent`, `/otel`,
  and `/apointoo`, but the package README documents only the root and
  `/incubating`. Architecture still calls these subpaths future Phase 3 work
  and records schema/classifier version `1.1.0`, while the code emits `1.2.0`.
- Impact: consumers cannot tell which APIs are stable, which are AI-safe, how
  to wire destinations, or which version stamps they should expect.
- Fix: publish a compact subpath table, AI workflow boundary example, browser
  consent/storage/transport setup, ESM requirement, and current version stamps.
  Mark `/conversation`, `/agent`, `/otel`, and `/apointoo` incubating until
  their contracts are intentionally stabilized.
- Mitigation: keep consumers on the root entrypoint for stable integrations;
  do not treat incubating subpaths as enterprise API commitments.
- False positive notes: source comments are substantially clearer than the
  published README; npm consumers primarily see the README, not source files.

### GOV-001

- Severity: **High, publication gate**
- Rule: MIT publication requires resolved copyright and provenance authority.
- Location: `PROVENANCE-AUDIT.md:180-222`.
- Evidence: the audit still lists unresolved B1 ownership attestation, B2
  Apointoo license chain, B3 AI-authored material posture, and B4 scope/artifact
  verification. It concludes that MIT publication is conditional and does not
  authorize publication.
- Impact: publishing before these attestations are resolved creates licensing,
  provenance, and downstream enterprise procurement risk.
- Fix: record the owner's attestations and close B1-B4, or change the license/
  provenance position before the first public npm release.
- Mitigation: keep the package unpublished and do not create `v0.1.0` until
  the audit is explicitly closed.
- False positive notes: this is a governance gate from the repository's own
  audit, not a newly discovered code vulnerability.

## Release decision

### Technical status

**Technically installable, testable, and ready for an explicit first-publication
decision.** The AI metadata boundary, cross-domain failure mode, HTTP failure
visibility, cookie defaults, CI parity dispatch, and public API documentation
now match their stated contracts. WP parity still has 25 unruled differences,
and the provenance audit is not closed.

### Required next slice

1. Decide whether to accept unresolved `GOV-001` before publication.
2. Reconcile the 25 unruled WP parity differences before claiming plugin
   field parity or starting the WordPress runtime swap.
3. Re-run tarball install, subpath imports, Node 18/20/22 checks, CI, and
   `npm publish --dry-run` before each publication.
