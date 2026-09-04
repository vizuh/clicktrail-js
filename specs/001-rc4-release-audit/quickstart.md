# Quickstart: Validate RC4 Release Evidence

## Prerequisites

- Clean checkout of the reviewed release commit
- Node and pnpm versions accepted by the repository
- No npm credential values printed or copied into the repository

## Local release gate

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm probe
CLICKTRAIL_WP_PLUGIN_ROOT=/path/to/pinned/click-trail-handler pnpm parity
pnpm audit --prod --audit-level high
(cd python/clicktrail && python3 -m pytest -q)
git diff --check
```

Expected: all commands exit zero and the browser probe reports 12/12 fixtures.

## Audit coverage gate

Validate `checklists/audit-results.json` against `contracts/audit-result.schema.json`, then
compare identifiers and exact titles with `checklists/prompt-catalog.json`.

Expected: 126 unique, contiguous results. Any unresolved Critical finding keeps
publication blocked and must remain visible in `checklists/final-audit-verdict.md`.

## Package gate

Pack every public workspace package. Review each tarball file list and scan for credentials,
private data, source fixtures, internal-only documentation, and unexpected dependencies.
Install the five first-wave tarballs in an empty consumer and import all documented interfaces.

Expected: intended files only and clean imports without repository state.

## Publication gate

Before tagging, require reviewed merge to `master`, green CI, accepted provenance evidence,
working npm identity, all five package names under the correct owner, and package-level trusted
publishers for repository `vizuh/clicktrail-js`, workflow `publish.yml`, environment `npm`.

After pushing `v0.1.0-rc.4`, verify the GitHub Actions run, npm provenance, `next` dist-tag,
registry metadata, and clean registry installation for all five packages.
