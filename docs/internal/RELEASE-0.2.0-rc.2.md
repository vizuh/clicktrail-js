# 0.2.0-rc.2 release record

Prepared 2026-09-13 from merged master `1b9d5cea63b388b4bafcfadcdfc14e056b9d240f`.
Status: validated locally; publication pending external authentication and review.

## Scope

Align 14 included JS package manifests, Nuxt runtime metadata, product READMEs,
changelog and release authorization at 0.2.0-rc.2. The npm wave is only core,
browser, umbrella, Astro and Nuxt, published under `next`; stable `latest` is
unchanged. Activepieces and Python releases remain outside this wave.

The candidate includes the merged RC1 follow-up corrections: standalone site
dependency remediation and Nuxt version alignment. Historical GitHub RC1 tags
are not changed. RC2 should use one approved merge commit for `v0.2.0-rc.2`,
GitHub release and npm provenance.

Fixed a missing closing quote in the publish workflow's jq approval-count
expression. Extracting that shell block and running `bash -n` failed before
the change and passes afterward. The approving-review check remains enforced.

## Validation

- Node 24.15.0 / pnpm 10.30.1; frozen lockfile installation passed.
- `pnpm typecheck`, `pnpm test` (746 tests), `pnpm build`: passed.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `pnpm probe`: 12/12 fixtures and cached dynamic form-to-CRM reference passed.
- Exact WordPress parity pin `ead6682d6433c4f27309b7ee412e2dfc1fd50de4`:
  15 matches, 10 documented differences, zero new findings/errors.
- Existing CI pack/clean-install script: eight manifests and imports passed;
  internal dependency versions resolve to 0.2.0-rc.2 in packed artifacts.
- Six trusted-publishing verifier tests passed; owner authorization validated.
- `git diff --check` and publish approval-check shell syntax passed.

## Publication prerequisites

Local npm authentication returned E401. Browser login initiated; no successful
sign-in observed at preparation time. Package names already exist, so do not
repeat namespace bootstrap. The existing publisher still requires package-level
trusted configuration, its fresh signed attestation, an approving review of the
exact PR head, merged master and passing required checks. No npm tag or package
has been published by this preparation.

## Review

Scope checked against the requested matching GitHub/npm candidate. Changes are
version alignment, truthful pending-publication documentation and one shell
syntax correction. Existing privacy, review and publishing checks are preserved.
