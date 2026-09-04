# ClickTrail RC4 Final Audit Verdict

## Decision

**CONDITIONAL — DO NOT PUBLISH NOW.**

Local engineering readiness and owner authorization are now recorded. Publication
still waits for the reviewed commit-to-registry chain: clean commits, merged PR,
green remote checks, namespace bootstrap, and package-specific trusted publishing.

## Exact prompt coverage

- Catalog: `prompt-catalog.json`
- Results: `audit-results.json`
- Schema: `../contracts/audit-result.schema.json`
- Coverage: **126 of 126 IDs**, exact titles, no duplicates or gaps
- Status counts: **26 PASS / 34 FINDING / 66 N/A**
- Severity counts: **8 Critical / 22 Important / 4 Minor / 92 None**

The result records preserve what each audit prompt observed. Remediation does
not rewrite a `FINDING` to `PASS`; disposition is tracked below.

## Finding disposition

### Locally remediated

- Tenant identity propagation and tests: 2, 7, 25, 36, 48, 85, 102.
- Collision-resistant cross-runtime stable IDs and shared fixtures: 15, 85,
  116, 126.
- Separate namespace bootstrap version and exact packed-artifact publication:
  10, 19, 70, 104, 105.
- Consent queue/storage erasure and lifecycle cleanup: 52, 71, 119, 123, 124.
- Dependency, homepage, and documentation corrections: 8, 63, 108, 122,
  125, 126.
- Server destination hardening: 69. Static validation now requires public
  HTTPS and rejects credentials plus obvious local/private/reserved hosts.
  Operator-owned outbound allowlists remain the defense against DNS rebinding.

### Still blocking

- **Authorization and provenance (resolved 2026-08-25):** the owner selected
  Vizuh OÜ, authorized npm user `atroci` as publisher, approved B1-B3, and
  resolved B4 plus GOV-001 for the five-package RC4 wave only.
- **Reviewed immutable source:** 4, 55, 99, 114. The 178-path mixed worktree was
  classified in `worktree-classification.md`, but it is not a reviewed commit,
  merged PR, or remote green SHA.
- **Registry and OIDC:** the canonical `NPM_TOKEN` authenticates as npm user
  `atroci`, an owner of the `vizuh` organization with read-write account access
  to the existing package. Four first-wave names still need authorized bootstrap;
  the token's publish scope is not proven without an irreversible write, and all
  first-wave packages need package-specific trusted publishers.
- **Final release note inventory:** 63 is locally updated but must be regenerated
  from the final reviewed PR before tagging.
- **Remote vulnerability closure:** 114 and 125 require OSV/CodeQL/workflow
  evidence on the final commit even though the local graph now resolves
  `cookie@0.7.2` and the production audit is clean.

### Explicitly deferred outside the five-package wave

- 68: consolidate duplicated integration server helpers only after the release
  scope is stable; do not refactor them opportunistically in RC4.
- Activepieces portion of 105: `@vizuh/clicktrail-piece` is excluded because its
  SDK pulls unpatched `expr-eval`. It was not packed, tested, or approved for
  publication.

## Local verification

- Frozen pnpm install: PASS
- Strict TypeScript typecheck: PASS
- JS tests: PASS, **692 tests** across 14 workspace projects
- Python `clicktrail` tests: PASS, **71 tests**
- Builds: PASS, 14 workspace projects; includes `ClickTrail.svelte` compilation
- Browser golden probe: PASS, **12/12**
- Pinned WordPress parity: PASS, `match=15`, `ruledDiff=10`,
  `newFindings=0`, `errors=0`
- Production dependency audit: PASS, no known vulnerabilities
- Package artifacts: PASS for 14 non-Activepieces packages; exact internal
  versions, no forbidden paths, and no credential-shaped content
- First-wave exact tarball clean-room import: PASS, 9 import surfaces
- `git diff --check`: PASS
- Owner authorization verifier: PASS for the five-package `0.1.0-rc.4` scope

This local evidence must be repeated remotely on the reviewed commit before the
release tag is created.

## Council Round 3

Taleb, Sutskever, and Kahneman reached the same verdict: **CONDITIONAL, therefore
DO NOT PUBLISH now**. All three separate local engineering readiness from
publication authority and remote evidence.

### Fail-closed kill criteria

1. Copyright holder, publisher authority, GOV-001, or B1-B4 is unresolved.
2. npm identity/ownership, namespace bootstrap, or package-specific OIDC is
   unverified.
3. The release input is mixed/unreviewed, lacks a merged PR, or lacks green
   remote CI on the exact tagged master SHA.
4. The tested/scanned tarballs differ from the published tarballs, or any
   version, dependency, hash, provenance, secret scan, or dist-tag check fails.
5. Any partial-release dependency inconsistency appears. Stop rather than
   improvise around npm immutability.

### Concrete next action

Commit the classified RC4 and audit scopes without the OSS-outreach paths, open
a reviewed PR, and require green remote checks. Then bootstrap the four missing
names, configure trusted publishing, merge, and tag the exact reviewed SHA.

### Minority report

The strongest argument for moving now is namespace capture: four package names
remain exposed, `next` limits default adoption, and the new same-tarball workflow
is unusually strict. This becomes persuasive immediately after authorization
and secure bootstrap. It does not override absent ownership and provenance
approval.
