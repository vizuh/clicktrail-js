# First Publication Checklist — ClickTrail JS packages

Gate order matters. Do not skip ahead. Every box needs its evidence linked.

## Current RC4 state

The `release/0.1.0-rc.4` branch contains the current release candidate. No RC4
tag or GitHub release exists yet. The historical RC3 publish run
[32788003812](https://github.com/vizuh/clicktrail-js/actions/runs/32788003812)
stopped at `@vizuh/clicktrail-core` because the new package did not exist on
npm. The registry currently contains the older `@vizuh/clicktrail@0.1.0`; the
other first-wave names still need one-time authenticated bootstrap and
package-level trusted-publisher configuration.

## 0. Governance (blocking everything)
- [x] Copyright holder decided: Vizuh OÜ; LICENSE and package metadata match
- [x] Namespace decided (`@vizuh`) and applied to current package manifests -> see OWNER-NAMESPACE-DECISION.md
- [x] B1 approved by Hugo for RC4 (historical contributors)
- [x] B2 approved by Hugo for RC4 (Apointoo channel-classify.ts)
- [x] B3 approved by Hugo for RC4 (AI-assisted commits)
- [x] B4 resolved: authenticated org ownership/read-write package access and artifact audit verified
- [x] `RELEASE-AUTHORIZATION.json` completed by the accountable owner and
  `CLICKTRAIL_RELEASE_VERSION=0.1.0-rc.4 node tools/release/verify-release-authorization.mjs` passes

## 1. Repository
- [x] Public remote: `https://github.com/vizuh/clicktrail-js`
- [x] Namespace decision recorded: `@vizuh/clicktrail`
- [x] License/provenance approved for the five-package RC4 wave

## 2. Remote CI green
- [ ] verify job green on Node 18, 20, and 22
- [ ] integration job green: Chromium, Firefox, and WebKit probes 12/12 on clean runners
- [ ] parity harness: either ran with sibling checkout, OR skipped WITH visible step-summary warning; require_parity dispatch exercised once successfully
- [ ] pack smoke job green for core, browser, umbrella, Astro, and Nuxt exact tarballs
- [ ] build reproducible on clean runner (no local filesystem assumptions)

## 3. Package
- [x] `@vizuh/clicktrail` version set to `0.1.0-rc.4` after governance gates passed
- [ ] Commit package version and create matching Git tag `v0.1.0-rc.4`
- [x] Exact local `pnpm pack` tarballs reviewed and scanned for forbidden paths and credentials
- [x] Local leak scan: no .env / credentials / private fixtures / internal docs
- [x] Local clean-room project installs the five first-wave tarballs; nine public surfaces import
- [ ] stamps report expected schema_version/classifier_version

## 4. npm identity
- [ ] `npm login` done; 2FA enabled on the account
- [x] Secret-store token `npm whoami` returns expected user `atroci`
- [x] `npm org ls vizuh` confirms `atroci` is an owner
- [ ] Each first-wave package exists on npm: core, browser, umbrella, Astro, Nuxt
- [ ] Each first-wave package has trusted publisher configured for `vizuh/clicktrail-js`, `publish.yml`, environment `npm`, and `npm publish`; workflow requires the external `CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION` secret

## 5. First publish
- [ ] After owner authorization passes, publish only the distinct `0.0.0-bootstrap.0` placeholders for missing names with Hugo-authenticated 2FA, then configure trusted publishing
- [ ] Push the RC4 tag only after the bootstrap checks pass; publish wave uses npm dist-tag `next`
- [ ] Verify npmjs.com page: description, repository link, README rendering
- [ ] Install fresh from registry in a clean project; smoke again

## 6. Post-first-publish
- [ ] Configure GitHub Actions OIDC trusted publishing (impossible before package exists); enable staged releases if available
- [ ] Remove any draft token-based publish path
- [ ] Only then begin WP staging swap per WP-SWAP-STAGING-PLAN.md (requires separate Hugo approval)
- [ ] No production swap, no live Chatwoot/Apointoo pilots until staging plan passes

## Explicitly forbidden without separate written approval
- `npm publish` outside this checklist's step 5
- WordPress production runtime swap
- Live pilot traffic
- Any attestation text authored on Hugo's behalf beyond the templates he approved
