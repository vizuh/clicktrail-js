# Implementation Plan: RC4 Release Audit and Publication

**Branch**: `release/0.1.0-rc.4` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-rc4-release-audit/spec.md`

## Summary

Create a traceable release gate for ClickTrail JS 0.1.0-rc.4. Extract the user's exact
126-prompt catalog, evaluate every item with repository evidence, fix verified blockers,
validate all public package artifacts, and publish the first wave only after governance,
npm identity, and trusted-publisher gates are closed.

## Technical Context

**Language/Version**: TypeScript 5.x; ESM; Node.js 18, 20, and 22 compatibility; Node 24 trusted-publishing runner

**Primary Dependencies**: pnpm workspace, TypeScript, Vitest, Playwright, Astro/Nuxt integration dependencies, GitHub Actions, npm OIDC trusted publishing

**Storage**: Repository files, Git objects, GitHub workflow evidence, npm registry metadata; no application database

**Testing**: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm probe`, production audit, package dry-runs, clean-room imports, remote CI

**Target Platform**: npm registry consumers and GitHub Actions on Linux; browser probes for supported engines

**Project Type**: Multi-package library and integration monorepo

**Performance Goals**: Publish workflow completes within its 15-minute timeout; browser probe completes 12/12 fixtures; package installation has no undeclared workspace dependency

**Constraints**: No credential exposure; no token-based CI fallback; immutable package versions and tags; first wave limited to five packages; exact 126/126 audit coverage

**Scale/Scope**: 15 public packages at RC4, five packages in the first npm wave, 126 prompt checks, 63 tracked changed files plus planned new files at audit start

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Deterministic Contracts**: PASS — existing fixture, type, unit, and browser gates remain required.
- **Consent and Trust Boundaries**: PASS PENDING AUDIT — security reviewers must verify changed browser/server/integration paths.
- **Executable Evidence**: PASS PENDING EXECUTION — all required behavior and package gates are tasks.
- **Minimal Public Surfaces**: PASS PENDING TAR REVIEW — every public tarball must be inspected and clean-room tested.
- **Governed Supply Chain**: BLOCKED — npm authentication, package bootstrap, trusted publishers, review, remote CI, and provenance attestations remain open.

No publication task may run while a Constitution Check item is blocked.

## Project Structure

### Documentation (this feature)

```text
specs/001-rc4-release-audit/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audit-result.schema.json
├── checklists/
│   ├── requirements.md
│   └── prompt-audit.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/                 # Core, browser, umbrella, consent, and server packages
integrations/             # Framework and platform packages
probe/                    # Browser fixture probe
tools/release/            # Bounded release utilities
.github/workflows/        # CI and tag-triggered publish workflow
docs/internal/            # Release governance and readiness evidence
```

**Structure Decision**: Keep audit artifacts under `specs/001-rc4-release-audit/` and
limit runtime fixes to existing package/integration paths. Do not add a second release
implementation or token-based publishing path.

## Complexity Tracking

No constitution violation is justified. Publication remains blocked until all gates pass.
