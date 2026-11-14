# Implementation Plan: Clear node-forge Production Audit Advisories

**Branch**: `Atroci/ct-js-05-ci-audit` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md) | **Issue**: [#84](https://github.com/vizuh/clicktrail-js/issues/84)

## Summary

Add `"node-forge@<1.4.1": "^1.4.1"` to `pnpm.overrides` in the root `package.json` and regenerate the lockfile. `listhen` declares `node-forge` with a range that allowed the vulnerable `1.4.0`; the override lifts it to the latest patched release in range (`1.4.3` at the time of writing).

## Technical Context

**Tooling**: pnpm 10.30.1 workspace, Node 22 (the only matrix entry that runs the audit step)
**Files touched**: root `package.json` (overrides only), `pnpm-lock.yaml`, this spec folder
**Out of scope**: `packages/**/src`, `integrations/**/src`, package versions, `pnpm.auditConfig.ignoreGhsas` (the two entries there are unrelated advisories and are left as is)

## Design

Range-scoped override (`node-forge@<1.4.1`) rather than a blanket pin, as used for `brace-expansion`, `undici`, `launch-editor`: it only rewrites vulnerable resolutions and stops applying once the upstream chain moves past 1.4.1. Upgrading the chain (nuxt, nitropack, listhen) was rejected: `nuxt` is already pinned and no newer listhen is needed once the transitive is patched.

## Verification

1. Base commit: `pnpm audit --prod --audit-level high` exits 1.
2. Patched: same command exits 0; `pnpm install --frozen-lockfile` passes.
3. `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`, `pnpm -r build` pass.

## Rollback

Revert the commit. The lockfile returns to `node-forge@1.4.0` and the audit step goes red again.
