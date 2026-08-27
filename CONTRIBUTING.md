# Contributing to ClickTrail JS

ClickTrail JS is a pnpm workspace. The first release wave is
`@vizuh/clicktrail-core`, `@vizuh/clicktrail-browser`,
`@vizuh/clicktrail`, `@vizuh/clicktrail-astro`, and
`@vizuh/clicktrail-nuxt`.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm probe
pnpm audit --prod --audit-level high
```

The browser probe runs Chromium by default. Set
`CLICKTRAIL_BROWSER=firefox` or `CLICKTRAIL_BROWSER=webkit` when those
Playwright browsers are installed.

## Pull requests

Keep changes small and update tests/docs with behavior changes. Include the
package, runtime, browser, and parity checks you ran. Do not include secrets,
real visitor data, generated `dist/` files, or `node_modules/`.

Security issues belong in a private GitHub Security Advisory; see
[`SECURITY.md`](SECURITY.md).

## Releases

Package versions and the Git tag must match. Release work belongs on a
`release/<version>` branch; do not push release commits or tags directly from
an unreviewed working tree.

Before tagging, run the complete local gate:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm probe
pnpm audit --prod --audit-level high
```

The GitHub release path is:

1. Commit the release candidate and open a pull request from the release branch.
2. Merge the reviewed branch into `master`.
3. Before tagging, complete namespace bootstrap and trusted-publisher setup for
   every first-wave package. After Hugo completes npm 2FA locally, run
   [`tools/release/bootstrap-new-packages.sh`](tools/release/bootstrap-new-packages.sh)
   for missing first-wave names. Then configure the npmjs.com trusted publisher
   for each package with repository `vizuh/clicktrail-js`, workflow `publish.yml`,
   and environment `npm`. Do not commit npm tokens or create a fallback
   token-based workflow.
4. Create and push the matching tag, for example:
   `git tag -a v0.1.0-rc.4 -m "ClickTrail 0.1.0-rc.4"` followed by
   `git push origin v0.1.0-rc.4`.
5. The tag triggers `.github/workflows/publish.yml`.
6. The workflow reruns the checks and publishes the first wave with npm OIDC
   provenance. This RC4 workflow publishes only prerelease versions under
   the `next` dist-tag.

The complete gate order and evidence requirements are in
[`docs/internal/FIRST-PUBLICATION-CHECKLIST.md`](docs/internal/FIRST-PUBLICATION-CHECKLIST.md).
