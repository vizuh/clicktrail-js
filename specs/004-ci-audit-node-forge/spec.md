# Feature Specification: Clear node-forge Production Audit Advisories

**Feature Branch**: `Atroci/ct-js-05-ci-audit`

**Created**: 2026-11-14

**Status**: Implemented in this PR.

**Input**: GitHub issue [#84](https://github.com/vizuh/clicktrail-js/issues/84). The CI step "Production dependency audit" (`pnpm audit --prod --audit-level high`, Node 22 job in `.github/workflows/ci.yml`) fails on master with seven high advisories for `node-forge <=1.4.0`, reached through `integrations__nuxt>nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge`. The failure is pre-existing and blocks every open PR (#78 to #81).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CI audit step is green again (Priority: P1)

A maintainer opens a PR and the "Production dependency audit" step passes, so unrelated work is not blocked by an advisory in a transitive dependency of the Nuxt integration.

**Why this priority**: The red step blocks every PR and the nightly scan.

**Independent Test**: Run `pnpm audit --prod --audit-level high` from the repo root. It exits 0 with the patch applied and exits 1 on the base commit.

**Acceptance Scenarios**:

1. **Given** the base commit, **When** `pnpm audit --prod --audit-level high` runs, **Then** it exits 1 and lists seven high `node-forge` advisories (GHSA-7wch-p9px-956x, GHSA-jc66-7q78-782g, GHSA-8hrf-8g6f-7xwp, GHSA-hqq3-7jhf-c5jx, GHSA-5x38-2vff-x55p, GHSA-rhr8-3pm8-cq29, GHSA-6qrw-m8cv-hcxf).
2. **Given** this change, **When** the same command runs, **Then** it exits 0 and reports no high or critical advisory that is not already in `pnpm.auditConfig.ignoreGhsas`.
3. **Given** this change, **When** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace` and `pnpm -r build` run, **Then** all pass.

## Requirements *(mandatory)*

- **FR-001**: `node-forge` resolves to a version `>=1.4.1` everywhere in the workspace, through a range-scoped `pnpm.overrides` entry in the root `package.json`, matching the style of the existing overrides (#76).
- **FR-002**: `pnpm-lock.yaml` is regenerated and `pnpm install --frozen-lockfile` passes.
- **FR-003**: No published package source, package version, or `ignoreGhsas` entry changes.

## Success Criteria

- **SC-001**: The CI audit command exits 0.
- **SC-002**: The lockfile diff touches only the `node-forge` resolution and the override record.

## Assumptions

- `node-forge` is only a transitive dependency of the Nuxt integration's dev and peer install graph (`listhen`, used by Nitro's dev server). No published ClickTrail package imports it, so the override changes no runtime behaviour for package consumers.
