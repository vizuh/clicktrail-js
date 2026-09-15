# CI failure boundary playbook

This document is an execution contract for humans and coding agents. A failed boundary is evidence of a defect in code, metadata, dependencies, environment, or release state. Do not weaken assertions, skip jobs, replace `--frozen-lockfile`, or change a test to make the pipeline green.

## Required order

Run from `clicktrail-js` and stop at the first failed boundary:

```sh
pnpm install --frozen-lockfile
pnpm verify:workspace
pnpm typecheck
pnpm -r test
pnpm -r build
```

Then run the relevant integration, package, or release check. Save the command, exit code, first actionable error, changed files, and rerun result.

## Boundary decision table

| Boundary | Evidence | Correct action | Stop condition |
| --- | --- | --- | --- |
| Install | `ERR_PNPM_OUTDATED_LOCKFILE`, missing package, engine error | Compare every changed `package.json` with `pnpm-lock.yaml`; regenerate lockfile only when manifests changed; investigate engine compatibility | Do not use `--no-frozen-lockfile` in CI |
| Workspace contract | `verify-workspace-contract` reports importer/script/tsconfig | Correct the package manifest, lockfile importer, or workspace config; rerun the verifier | Do not remove a package from the workspace to hide it |
| Typecheck | `TS*` diagnostics or missing `tsconfig.json` | Fix source types or add the legitimate package config required by the root command | Do not suppress diagnostics or exclude the package without a documented architecture reason |
| Unit tests | Assertion or fixture failure | Reproduce the smallest failing test, inspect the shared contract, fix production code/fixture, rerun the focused and full tests | Do not edit the assertion merely to match broken behavior |
| Build | compiler, bundler, or export failure | Fix source, package exports, generated output, or dependency metadata | Do not mark a package build optional to bypass a failure |
| Integration/probe | browser, webhook, consent, or parity failure | Inspect the boundary payload and runtime evidence; fix the integration and rerun the same scenario | Do not claim live behavior from unit tests |
| Pack/clean-room | forbidden file, missing export, or install/import failure | Inspect the exact tarball contents and package metadata; correct `files`, exports, versions, or dependency edges | Do not publish an uninspected tarball |
| Release/publication | approval, tag, npm identity, provenance, or registry failure | Resolve the governance or credential gate; keep the candidate unpublished | No tag or publish while a required gate is blocked |

## Agent procedure

1. Identify the first failing boundary, not the last red job.
2. Capture the exact error and a minimal reproduction command.
3. Inspect the caller, manifest, lockfile, fixture, and owning contract.
4. Make the smallest production or metadata correction.
5. Run the focused check, then the original command, then the aggregate gate.
6. Report unresolved risks and evidence. Unknown is not pass.

## Release note

The current release workflow requires a reviewed merge to protected `master`, required CI checks, release authorization, package bootstrap/trusted publishing, and npm provenance. Local green tests do not authorize production publication.
