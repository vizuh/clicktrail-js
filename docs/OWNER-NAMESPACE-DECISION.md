# Owner & Namespace Decision — ClickTrail

Status: NAMESPACE DECIDED; COPYRIGHT/PROVENANCE GATES OPEN.
Prepared: 2026-08-23. Related: PROVENANCE-AUDIT.md blockers B1-B4.

Hugo decision (2026-08-24): npm package `@vizuh/clicktrail`; public GitHub
repository `vizuh/clicktrail-js`.

## The two questions

**A. Legal copyright holder** (LICENSE + package author field):
- `Copyright (c) 2026 Hugo Carvalho` (personal)
- `Copyright (c) 2026 Vizuh OÜ` (company that actually holds/receives the rights)

Rule: choose the party that genuinely owns or has received the rights — not for appearance.

**B. Permanent public namespace**:

| Option | npm package | GitHub repo | Trade-offs |
|---|---|---|---|
| 1 | `@apointoo/clicktrail` | `apointoo/clicktrail-js` | Ties open infrastructure to the commercial product brand; strongest product alignment since ClickTrail is Apointoo's capture layer; requires an apointoo npm org + GitHub org |
| 2 | `@vizuh/clicktrail` | `vizuh/clicktrail-js` | Uses Vizuh as legal owner, npm scope, and GitHub owner; selected |
| 3 | Personal scope (`@<hugo-npm-user>/clicktrail`) | personal GitHub account | Fastest to create; weakest long-term home; migrating a public package identity later is costly |

Historical external recommendation (superseded by decision above): Option 1 IF Apointoo is intended as the
public platform brand; Option 2 only if Funnelsheet is deliberately becoming the
umbrella developer brand. Decision is Hugo's alone.

## Everything that must change per option

Current state assumes Option 2. Change matrix:

| Field / file | Option 1 (@apointoo) | Option 2 (@vizuh) | Option 3 (personal) |
|---|---|---|---|
| `packages/clicktrail/package.json` -> name | `@apointoo/clicktrail` | no change | `@<user>/clicktrail` |
| same -> repository.url | `github.com/apointoo/clicktrail-js` | `github.com/vizuh/clicktrail-js` | personal repo URL |
| root `README.md` install snippets | change scope | no change | change scope |
| `packages/clicktrail/README.md` install snippets | change scope | no change | change scope |
| `LICENSE` copyright line | follows decision A | follows decision A | follows decision A |
| `.github/workflows/publish.yml` (draft) environment/org references | update | verify | update |
| `.github/workflows/ci.yml` | no change | no change | no change |
| npm provenance (later) | repo must be public + URLs match | same | same |
| GitHub org creation | create `apointoo` org if absent | use existing `vizuh` owner | none |
| npm org creation | create `apointoo` org if absent | use existing `vizuh` org | none |
| docs/WP-SWAP-STAGING-PLAN.md | no change (brand-neutral) | no change | no change |
| WP plugin "Destinations" card copy (future) | mentions Apointoo destination only | unchanged | unchanged |

NOTE: renaming AFTER first publish means `npm deprecate` + `npm dist-tag` migration
forever. Decide before the first publish; never after.

## Attestation templates (Hugo approves verbatim ONLY where factually true)

### B1 - Historical contributors
> I confirm that commits attributed to Atroci, Hugo, and atroci were authored by me
> or made on my behalf, and that no unlisted human contributor holds rights that
> prevent the repository from being distributed under the selected license.

If any other person contributed meaningfully: list them and obtain permission or
assignment instead of signing this.

### B2 - Apointoo source file
> I confirm that channel-classify.ts originated from an Apointoo repository owned by
> me or by the designated repository owner, and that I am authorized to incorporate
> and distribute that implementation in ClickTrail under the selected license.

If the source repo is not wholly owned: remove or independently rewrite the
implementation from its functional specification instead.

### B3 - AI-assisted commits
> AI tools were used as implementation assistants. I supplied the requirements,
> selected, reviewed, modified, tested, and accepted the resulting implementation.
> The designated repository owner represents that it possesses the rights necessary
> to distribute the repository under the selected license.

## Version posture (decided, recorded)

First prerelease will be **0.1.0-rc.1** under the `next` dist-tag — NOT 1.0.0-rc.1.
SemVer reserves 1.0.0 for a validated public API; the WordPress staging swap,
7-day shadow comparison, canary rollout, and live pilots have not run yet.
The version bump itself is NOT executed until the first-publication checklist passes.

## Prepared-but-NOT-executed remote commands (OWNER placeholder)

```bash
# After decision B, replace OWNER and verify:
gh repo create OWNER/clicktrail-js --private --source=. --remote=origin --push

# Later, when making public:
gh repo edit OWNER/clicktrail-js --visibility public

# npm identity verification (after decision B):
npm login
npm whoami
npm org ls OWNER_SCOPE   # create the org on npmjs.com if absent
```

Nothing here creates remotes, publishes, or writes attestations automatically.
