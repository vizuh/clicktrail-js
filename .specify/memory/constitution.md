<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles: Deterministic Contracts; Consent and Trust Boundaries; Executable Evidence; Minimal Public Surfaces; Governed Supply Chain
- Added sections: Release Constraints; Development and Release Workflow
- Templates reviewed: spec-template.md (compatible), plan-template.md (generic gate populated by feature plans), tasks-template.md (compatible)
- Follow-up TODOs: none
-->
# ClickTrail JS Constitution

## Core Principles

### I. Deterministic Contracts

Core attribution behavior MUST be deterministic for the same explicit inputs. Time,
identifiers, storage, consent, and network access MUST be injected by the caller.
Canonical event fields and version stamps are public contracts. A classifier behavior
change requires a SemVer-major release or a documented compatibility rule.

### II. Consent and Trust Boundaries

No browser integration may capture, persist, or transmit attribution before the host's
consent gate allows it. Denied or withdrawn consent MUST have tested clearing behavior.
Browser attribution is untrusted observed context. It MUST NOT control authorization,
identity, pricing, workflow approval, or fraud decisions. Public adapters MUST bound and
allowlist fields and MUST NOT accept arbitrary payload, request, conversation, prompt,
completion, transcript, or PII passthrough.

### III. Executable Evidence

Every change to branching logic, parsers, security boundaries, data loss guards, or
published interfaces MUST have an executable behavior test. Release evidence MUST include
type checking, the complete test suite, builds, browser probes, production dependency
audit, package-content review, and clean-room imports. Source-text grep is not a substitute
for behavior tests.

### IV. Minimal Public Surfaces

Packages and integrations MUST expose only documented public entry points and the minimum
runtime dependencies required by their contract. Host integrations remain optional and
provider-neutral. Compatibility shims require a named public contract or observed deployed
state. Generated output, fixtures, tools, internal documents, credentials, and unrelated
workspace files MUST NOT enter npm tarballs.

### V. Governed Supply Chain

A release MUST use a reviewed non-default branch, a matching version and annotated Git tag,
and the repository's OIDC trusted-publishing workflow with npm provenance. Tokens MUST NOT
be committed or added as a fallback CI publishing path. New npm names require a bounded,
one-time authenticated bootstrap, followed by package-level trusted-publisher setup.
Unresolved ownership, licensing, provenance, secret exposure, tag mismatch, or package
identity findings are release blockers.

## Release Constraints

- The first npm wave is limited to core, browser, umbrella, Astro, and Nuxt until a later
  reviewed release expands the workflow.
- Release candidates use the `next` dist-tag; stable versions use `latest`.
- Node compatibility claims require clean evidence on the documented Node matrix.
- A GitHub release does not prove npm publication. Registry metadata, provenance, dist-tags,
  and clean installation MUST be verified after publishing.
- A partial publish MUST stop the wave and be recorded. Published versions are never reused.

## Development and Release Workflow

1. State acceptance criteria and inspect branch, worktrees, diff, and release documentation.
2. Keep implementation changes surgical and preserve unrelated work.
3. Run local executable gates and review package tarballs before committing.
4. Obtain code review and green remote CI before merging to `master`.
5. Close npm identity and trusted-publisher gates before pushing the release tag.
6. Verify every published package and record remaining risks after the workflow completes.

## Governance

This constitution governs ClickTrail JS release specifications and plans. Amendments require
a reviewed change that explains the compatibility and migration impact. MAJOR versions remove
or redefine principles, MINOR versions add or materially expand them, and PATCH versions clarify
without changing obligations. Every release plan and review MUST explicitly check these
principles. Workspace-level `AGENTS.md` instructions remain authoritative for safety, Git,
logging, and publication approval.

**Version**: 1.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
