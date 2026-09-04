# Tasks: RC4 Release Audit and Publication

**Input**: Design documents from `/specs/001-rc4-release-audit/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/audit-result.schema.json`

## Phase 1: Setup

- [x] T001 Initialize Spec Kit infrastructure and constitution in `.specify/` and `AGENTS.md`
- [x] T002 [P] Create the exact 126-title catalog in `specs/001-rc4-release-audit/checklists/prompt-catalog.json`
- [x] T003 [P] Create release specification and quality checklist in `specs/001-rc4-release-audit/spec.md` and `specs/001-rc4-release-audit/checklists/requirements.md`

## Phase 2: Foundational Release Evidence

- [x] T004 [P] Run seven read-only prompt audit partitions and merge exact results into `specs/001-rc4-release-audit/checklists/audit-results.json`
- [x] T005 [P] Run the risk council and record verdict, dissent, kill criteria, and next action in `specs/001-rc4-release-audit/checklists/final-audit-verdict.md`
- [x] T006 Classify every tracked and untracked change in `specs/001-rc4-release-audit/checklists/worktree-classification.md`

## Phase 3: User Story 1 - Install a trustworthy release candidate (Priority: P1)

**Goal**: Every intended package is an inspectable, installable RC4 artifact.

**Independent Test**: Pack from the reviewed tree, install in clean consumers, and import documented interfaces.

- [x] T007 [P] [US1] Pack and inventory 14 workspace packages and record the explicit Activepieces deferral in `specs/001-rc4-release-audit/checklists/package-artifact-audit.json`
- [x] T008 [P] [US1] Run exact-dependency, secret, and unexpected-file checks and record evidence in `specs/001-rc4-release-audit/checklists/package-artifact-audit.json`
- [x] T009 [US1] Clean-room install and import the five first-wave tarballs and documented umbrella subpaths, recorded in `specs/001-rc4-release-audit/checklists/package-artifact-audit.json`

## Phase 4: User Story 2 - Review every supplied quality lens (Priority: P1)

**Goal**: Exact 126/126 evidence-backed audit coverage with blockers resolved.

**Independent Test**: Validate audit JSON against the contract and exact catalog.

- [x] T010 [US2] Validate 126/126 ids, exact titles, statuses, evidence, and severities against `specs/001-rc4-release-audit/contracts/audit-result.schema.json`
- [ ] T011 [US2] Fix every verified Critical finding and add executable regression evidence in the affected package or integration test paths
- [ ] T012 [US2] Fix or obtain explicit user acceptance for every Important finding and update `specs/001-rc4-release-audit/checklists/prompt-audit.md`
- [x] T013 [US2] Re-run frozen install, typecheck, tests, builds, probe, pinned parity, production audit, Python tests, package checks, and diff checks from `specs/001-rc4-release-audit/quickstart.md`

## Phase 5: User Story 3 - Publish through a controlled supply chain (Priority: P1)

**Goal**: Publish the reviewed first wave using OIDC provenance and verify npm.

**Independent Test**: Registry installation and provenance inspection for all five packages.

- [ ] T014 [US3] Commit only the reviewed release scope on `release/0.1.0-rc.4`
- [ ] T015 [US3] Run no-mistakes with the full user intent and resolve its review, test, lint, docs, PR, and CI gates
- [ ] T016 [US3] Verify local npm PAT identity without exposing it and record only pass/fail in `specs/001-rc4-release-audit/publication-evidence.md`
- [ ] T017 [US3] Bootstrap missing first-wave names with `tools/release/bootstrap-new-packages.sh` and verify correct ownership
- [ ] T018 [US3] Configure and verify package-level trusted publishers for `vizuh/clicktrail-js`, `publish.yml`, environment `npm`
- [ ] T019 [US3] Close or explicitly resolve authorized provenance attestations B1-B4 in `docs/internal/PROVENANCE-AUDIT.md`
- [ ] T020 [US3] Merge reviewed PR, create annotated `v0.1.0-rc.4`, and push the tag only after all blocking gates pass
- [ ] T021 [US3] Verify GitHub Actions, npm metadata, provenance, `next` dist-tags, and clean registry installs in `specs/001-rc4-release-audit/publication-evidence.md`

## Dependencies & Execution Order

- T004–T006 can run after setup and must complete before release-scope commit.
- T007–T010 can run in parallel, but T011–T013 depend on their findings.
- T014 depends on T004–T013 and the council verdict.
- T015 depends on T014 because no-mistakes validates committed history.
- T016–T019 are independent blocking identity/governance gates after review.
- T020 depends on every preceding blocking task; T021 begins only after the publish workflow completes.

## Implementation Strategy

Keep all work reversible until T020. Do not use the release tag as a test. If any package
publishes before a later failure, stop, record the partial state, and prepare a new version
rather than reusing RC4.
