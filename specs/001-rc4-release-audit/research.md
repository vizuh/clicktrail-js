# Research: RC4 Release Audit and Publication

## Decision: Use the supplied titles as a bounded audit catalog

**Rationale**: The user requested one check for every prompt. Exact extraction produced 126
unique titles. A stable numbered catalog makes completeness machine-verifiable while allowing
non-applicable GitLab- or database-specific prompts to receive a concrete scope reason.

**Alternatives considered**: Treating the pasted page as inspiration would not satisfy exact
coverage. Running every prompt as if it were applicable would manufacture irrelevant changes.

## Decision: Keep the npm first wave at five packages

**Rationale**: `.github/workflows/publish.yml` explicitly validates and publishes core,
browser, umbrella, Astro, and Nuxt. Expanding the wave during an RC audit would increase the
blast radius and require additional package ownership and trusted-publisher setup.

**Alternatives considered**: Publishing all 15 RC4 manifests now was rejected because it is
not the reviewed workflow contract.

## Decision: Bootstrap missing npm names before pushing the tag

**Rationale**: npm trusted publishers are package-specific and cannot publish a package name
that does not yet exist. Four first-wave names are absent. Bootstrap must be authenticated,
local, bounded, and followed by trusted-publisher configuration.

**Alternatives considered**: A CI token fallback was rejected because it weakens the supply
chain and contradicts the existing OIDC design.

## Decision: Separate evidence collection from irreversible publication

**Rationale**: Local audits, commits, PR review, and tarball checks are reversible. npm versions
and public tags are not. The release tag is the final action only after exact commit evidence,
remote CI, governance, npm identity, and publisher gates pass.

**Alternatives considered**: Tagging early to discover failures was rejected because the
historical RC3 run already proved that missing package bootstrap fails late.
