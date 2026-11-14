# Tasks: Clear node-forge Production Audit Advisories

**Input**: [spec.md](spec.md), [plan.md](plan.md)

- [x] T001 Reproduce: run `pnpm audit --prod --audit-level high` on the base commit and record exit 1 with seven high `node-forge` advisories.
- [x] T002 Add `"node-forge@<1.4.1": "^1.4.1"` to `pnpm.overrides` in `package.json`.
- [x] T003 Regenerate `pnpm-lock.yaml` with `pnpm install --lockfile-only` and confirm the diff is limited to `node-forge` (1.4.0 to 1.4.3) and the override record.
- [x] T004 Run `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level high` (exit 0), `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`, `pnpm -r build`.
- [ ] T005 Independent review, then merge. PRs #78 to #81 rebase onto master afterwards.
