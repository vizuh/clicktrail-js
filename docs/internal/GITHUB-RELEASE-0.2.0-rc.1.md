# GitHub release validation: 0.2.0-rc.1

Date: 2026-09-12. Runtime baseline: `2e4683b980b4df9091c5dfed465c9eb461f7f481`.
Tag: `github-v0.2.0-rc.1`. Channel: GitHub source prerelease only.

## Changes

- Version the 14 included JS packages consistently at 0.2.0-rc.1.
- Update English and Portuguese product READMEs and changelog; remove the
  unavailable npm `next` installation example.
- Patch the release workspace's Astro/sharp/js-yaml dependency tree after a
  fresh audit. No application runtime source was modified in this release patch.
- Preserve the historical RC4 npm authorization record. The `github-v` prefix
  does not match the existing `v*` npm-publish workflow; npm stays at 0.1.0.

## Local validation

Node 24.15.0, pnpm 10.30.1, Linux. Checks rerun after dependency remediation:

| Check | Result |
|---|---|
| `pnpm typecheck` | Passed |
| `pnpm test` | 746 tests passed across included workspace packages |
| `pnpm build` | Passed |
| `pnpm audit --prod --audit-level high` | No known vulnerabilities found |
| `pnpm probe` | 12/12 fixtures and WordPress cached dynamic form-to-CRM reference passed |
| `pnpm parity` with exact WP pin | 15 matches, 10 documented differences, 0 new findings, 0 errors |
| Existing CI pack smoke, run locally | Eight tarballs passed exact internal-version validation and clean-room import checks |
| `git diff --check` | Passed |

The parity pin is `ead6682d6433c4f27309b7ee412e2dfc1fd50de4`; this check does
not claim parity with the current WordPress release. Remote candidate CI is a
separate evidence layer reported on the release PR.

## Audit remediation

Initial audit: one critical and two high findings. Resolved in this workspace
with Astro 7.2.8, sharp 0.35.4 and Astro's js-yaml 4.3.2. Relevant advisories:
GHSA-26w7-cxv4-gfx2, GHSA-rgj7-g3m4-5g8c, GHSA-2883-xcg3-v3hh.
Root overrides protect this source workspace; they are not a claim to patch an
existing consumer application's dependency tree.

## Release boundaries

- Preserve queued event IDs across the sha256-128-v1 migration; see changelog.
- Activepieces stays excluded and retains its earlier version. Python packages
  are not versioned or published in this JS release.
- Eight packed packages were checked as a local set. Their new internal versions
  are not in npm; individual tarballs are not advertised as registry-installable.
- No npm publication, WordPress deployment, provider acceptance, or production
  site update is implied. No new npm authorization was recorded.

## Review

Reviewed the release diff for scope, version alignment, lockfile consistency,
README installation claims and migration boundaries. The only dependency
changes address the audit findings. Existing runtime tests and pack checks
passed. No runtime refactor or new product capability was added by this patch.
