# Data Model: RC4 Release Audit

## Prompt Check

- `id`: integer 1–126, unique and contiguous
- `title`: exact supplied catalog title
- `status`: `PASS`, `FINDING`, or `N/A`
- `severity`: `Critical`, `Important`, `Minor`, or `None`
- `evidence`: non-empty repository, command, runtime, GitHub, or registry evidence
- `action`: remediation, acceptance decision, or specific N/A rationale

## Release Gate

- `name`: stable gate name
- `owner`: agent, repository maintainer, or Hugo
- `status`: open, passed, accepted, or blocked
- `evidence`: paths, checks, workflow runs, or registry observations
- `blocking`: whether publication is forbidden while open

## Package Artifact

- `name`: npm package name
- `version`: exact SemVer
- `directory`: workspace location
- `files`: packed file inventory
- `exports`: documented public interfaces
- `integrity`: generated tarball digest
- `clean_room_result`: install and import result

## State Transitions

`prepared -> audited -> reviewed -> merged -> tagged -> published -> verified`

Any Critical finding, rejected authentication, provenance blocker, or partial publish moves the
release to `blocked`. Published versions never return to `prepared` and are never overwritten.
