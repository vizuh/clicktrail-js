# Feature Specification: RC4 Release Audit and Publication

**Feature Branch**: `release/0.1.0-rc.4`

**Created**: 2026-08-25

**Status**: In review

**Input**: Prepare, audit, package, and publish ClickTrail JS 0.1.0-rc.4 only after every supplied GitLab resource-library prompt receives one evidence-backed check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install a trustworthy release candidate (Priority: P1)

A package consumer installs an RC package and imports its documented entry points without
needing repository files, undeclared workspace state, or a provider-specific dependency.

**Why this priority**: Installation and public imports are the release's primary user value.

**Independent Test**: Pack the first-wave packages, install them into an empty consumer
project, and import the documented public interfaces.

**Acceptance Scenarios**:

1. **Given** first-wave RC4 tarballs, **When** they are installed in a clean project,
   **Then** all documented entry points import successfully.
2. **Given** a packed artifact, **When** its contents are inspected, **Then** only the
   intended license, README, manifest, and distribution files are present.

---

### User Story 2 - Review every supplied quality lens (Priority: P1)

A release reviewer can trace each of the 126 supplied prompt titles to exactly one result:
pass, finding, or not applicable with a specific reason.

**Why this priority**: The user explicitly requires one check for every supplied prompt.

**Independent Test**: Compare the audit report identifiers and titles to the extracted
126-title catalog and require exact, unique, complete coverage.

**Acceptance Scenarios**:

1. **Given** the canonical 126-title catalog, **When** the audit report is validated,
   **Then** every identifier and exact title occurs once.
2. **Given** an applicable check, **When** its result is reviewed, **Then** it cites direct
   repository or runtime evidence.
3. **Given** a non-applicable check, **When** its result is reviewed, **Then** it explains
   why the prompt does not map to this TypeScript library release.

---

### User Story 3 - Publish through a controlled supply chain (Priority: P1)

The release operator publishes the reviewed first wave through GitHub Actions OIDC, with a
matching tag, npm provenance, and post-publication registry verification.

**Why this priority**: npm versions and public tags cannot be safely replaced after release.

**Independent Test**: Verify package identity and trusted-publisher configuration, push the
matching tag only after merge, observe a green publish workflow, then install from `next`.

**Acceptance Scenarios**:

1. **Given** closed governance and npm identity gates, **When** the matching RC4 tag is
   pushed from reviewed `master`, **Then** the workflow publishes only the documented wave
   with provenance and the `next` dist-tag.
2. **Given** any missing package identity, rejected credential, tag mismatch, or unresolved
   Critical finding, **When** publication is considered, **Then** the release stops before
   the tag is pushed.
3. **Given** a partial npm publish, **When** the workflow stops, **Then** published versions
   are not reused and the incident is recorded before a new candidate is prepared.

### Edge Cases

- The local npm PAT exists but `npm whoami` rejects it.
- Four first-wave package names do not yet exist on npm and need one-time bootstrap.
- Some packages publish successfully before a later package fails.
- The tag version differs from one package manifest or lockfile resolution.
- Workspace dependency ranges pack to an unexpected registry version.
- An untracked integration is built locally but omitted from the reviewed commit.
- A passing test suite hides missing package files or undeclared dependencies.
- GitHub Actions is green while required provenance attestations remain unresolved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All 15 public package manifests MUST declare `0.1.0-rc.4`.
- **FR-002**: First-wave package tarballs MUST contain only intended public artifacts and
  MUST install and import from a clean consumer project.
- **FR-003**: The audit MUST preserve the exact canonical catalog of 126 supplied prompt
  titles with stable identifiers 001 through 126.
- **FR-004**: Every catalog item MUST have exactly one PASS, FINDING, or N/A result.
- **FR-005**: PASS and FINDING results MUST cite direct evidence; N/A results MUST include a
  concrete scope reason.
- **FR-006**: Every Critical finding MUST be fixed and reverified before publication.
- **FR-007**: Every Important finding MUST be fixed or explicitly accepted by the user with
  a documented reason before publication.
- **FR-008**: The release MUST pass typecheck, complete tests, complete builds, browser probe,
  production dependency audit, diff checks, and clean-room package checks.
- **FR-009**: Package versions, the lockfile, changelog, release notes, and Git tag MUST agree.
- **FR-010**: npm credentials MUST remain local, unprinted, and absent from Git history and CI.
- **FR-011**: Missing npm names MUST be bootstrapped in a bounded one-time operation before
  OIDC publishing is attempted.
- **FR-012**: Each first-wave package MUST have the documented package-level trusted publisher
  before the release tag is pushed.
- **FR-013**: The tag-triggered workflow MUST publish only core, browser, umbrella, Astro, and
  Nuxt, using provenance and `next` for RC4.
- **FR-014**: Ownership, licensing, and provenance blockers MUST be closed by the authorized
  owner; the audit MUST NOT fabricate attestations.
- **FR-015**: The reviewed release commit MUST include all intended runtime, test, package,
  documentation, and specification files and MUST exclude unrelated outreach artifacts unless
  they are deliberately included in the reviewed scope.
- **FR-016**: Post-publication verification MUST check npm metadata, provenance, dist-tags, and
  clean installation for every first-wave package.

### Key Entities

- **Prompt Check**: Stable identifier, exact supplied title, status, severity, evidence, and action.
- **Release Gate**: Named condition with owner, evidence, status, and blocking effect.
- **Package Artifact**: Package name, version, tarball contents, public exports, and integrity.
- **Publication Wave**: Ordered set of packages published by one tag-triggered workflow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Audit coverage is 126/126 with no duplicate or missing identifiers or titles.
- **SC-002**: Zero unresolved Critical findings remain when the release tag is pushed.
- **SC-003**: All first-wave tarballs install and their documented interfaces import in a
  clean consumer project.
- **SC-004**: All required local and remote release checks complete successfully.
- **SC-005**: All five first-wave npm pages report `0.1.0-rc.4` under `next` with provenance.
- **SC-006**: No credential, private data, source fixture, internal-only document, or unrelated
  file is present in a published tarball.

## Assumptions

- `master` remains the default branch and tag publication occurs only after reviewed merge.
- The npm account and `@vizuh` scope are controlled by Hugo and support package creation.
- The current first-wave scope remains unchanged for RC4.
- GitLab-specific analytics and work-item prompts may be N/A because this is a GitHub-hosted
  repository; N/A still requires a repository-specific reason.
- Publication has no fixed deadline; safety gates take priority over speed.
