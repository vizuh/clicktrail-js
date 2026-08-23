# First Publication Checklist — @<scope>/clicktrail

Gate order matters. Do not skip ahead. Every box needs its evidence linked.

## 0. Governance (blocking everything)
- [ ] Copyright holder decided (Hugo Carvalho personally vs Vizuh OÜ) -> LICENSE + package metadata updated
- [ ] Namespace decided (@apointoo vs @funnelsheet vs personal) -> see OWNER-NAMESPACE-DECISION.md change matrix applied
- [ ] B1 attestation approved by Hugo verbatim (historical contributors)
- [ ] B2 attestation approved by Hugo verbatim (Apointoo channel-classify.ts) OR implementation independently rewritten
- [ ] B3 attestation approved by Hugo verbatim (AI-assisted commits)

## 1. Repository
- [ ] Remote created PRIVATE via prepared command (OWNER placeholder resolved)
- [ ] Push succeeds; all 17+ commits present
- [ ] License/provenance approved -> repo made public (required for npm provenance later)

## 2. Remote CI green
- [ ] verify job green on Node 20 AND 22
- [ ] integration job green: Playwright probe 12/12 on clean runner
- [ ] parity harness: either ran with sibling checkout, OR skipped WITH visible step-summary warning; require_parity dispatch exercised once successfully
- [ ] pack smoke job green (clean-room install of every subpath export)
- [ ] build reproducible on clean runner (no local filesystem assumptions)

## 3. Package
- [ ] `npm version 0.1.0-rc.1` executed (after CI green, before publish)
- [ ] `npm pack --dry-run` tarball reviewed file-by-file: only dist/, README.md, package.json, LICENSE
- [ ] leak scan re-run: no .env / credentials / private fixtures / internal docs
- [ ] clean-room consumer project installs tarball; ALL subpath exports import (., /browser, /conversation, /agent, /otel, /apointoo, /incubating)
- [ ] stamps report expected schema_version/classifier_version

## 4. npm identity
- [ ] `npm login` done; 2FA enabled on the account
- [ ] `npm whoami` returns expected user
- [ ] `npm org ls <scope>` confirms ownership of the chosen org/scope

## 5. First publish
- [ ] `npm publish --access public --tag next` (first-ever scoped release needs --access public; prerelease must NOT be latest)
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
