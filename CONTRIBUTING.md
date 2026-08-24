# Contributing to ClickTrail JS

ClickTrail JS is a pnpm workspace. The published packages are
`@vizuh/clicktrail` and `@clicktrail/astro`.

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

Package versions and the Git tag must match. Run the clean-room pack smoke
before tagging. npm publication uses GitHub Actions trusted publishing and
requires the package-level npm publisher configuration to be present.
