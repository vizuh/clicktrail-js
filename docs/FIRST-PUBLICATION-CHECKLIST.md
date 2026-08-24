# First Publication Checklist — ClickTrail JS packages

Gate order matters. Do not skip ahead. Every box needs its evidence linked.

## 0. Governance (blocking everything)
- [ ] Copyright holder decided (Hugo Carvalho personally vs Vizuh OÜ) -> LICENSE + package metadata updated
- [ ] Namespace decided (@apointoo vs @vizuh vs personal) -> see OWNER-NAMESPACE-DECISION.md change matrix applied
- [ ] B1 attestation approved by Hugo verbatim (historical contributors)
- [ ] B2 attestation approved by Hugo verbatim (Apointoo channel-classify.ts) OR implementation independently rewritten
- [ ] B3 attestation approved by Hugo verbatim (AI-assisted commits)

## 1. Repository
- [x] Public remote: `https://github.com/vizuh/clicktrail-js`
- [x] Namespace decision recorded: `@vizuh/clicktrail`
- [ ] License/provenance approved (required before npm publication)

## 2. Remote CI green
- [ ] verify job green on Node 18, 20, and 22
- [ ] integration job green: Chromium, Firefox, and WebKit probes 12/12 on clean runners
- [ ] parity harness: either ran with sibling checkout, OR skipped WITH visible step-summary warning; require_parity dispatch exercised once successfully
- [ ] pack smoke job green (clean-room install of `@vizuh/clicktrail` and `@clicktrail/astro`)
- [ ] build reproducible on clean runner (no local filesystem assumptions)

## 3. Package
- [ ] package versions set to `0.1.0-rc.2` after CI and governance gates pass
- [ ] Commit package versions and create matching Git tag `v0.1.0-rc.2`
- [ ] `pnpm pack --dry-run` tarballs reviewed file-by-file: only dist/, README.md, package.json, LICENSE
- [ ] leak scan re-run: no .env / credentials / private fixtures / internal docs
- [ ] clean-room consumer project installs tarball; ALL subpath exports import (., /browser, /conversation, /agent, /otel, /apointoo, /incubating)
- [ ] stamps report expected schema_version/classifier_version

## 4. npm identity
- [ ] `npm login` done; 2FA enabled on the account
- [ ] `npm whoami` returns expected user
- [ ] `npm org ls <scope>` confirms ownership of the chosen org/scope

## 5. First publish
- [ ] Push `v0.1.0-rc.2`; trusted-publishing workflow publishes with npm dist-tag `next`
- [ ] Verify npmjs.com page: description, repository link, README rendering
- [ ] Install fresh from registry in a clean project; smoke again

## 6. Post-first-publish
- [ ] Configure GitHub Actions OIDC trusted publishing (impossible before package exists); enable staged releases if available
- [ ] Remove any draft token-based publish path
- [ ] Only then begin WP staging swap per docs/WP-SWAP-STAGING-PLAN.md (requires separate Hugo approval)
- [ ] No production swap, no live Chatwoot/Apointoo pilots until staging plan passes

## Explicitly forbidden without separate written approval
- `npm publish` outside this checklist's step 5
- WordPress production runtime swap
- Live pilot traffic
- Any attestation text authored on Hugo's behalf beyond the templates he approved
