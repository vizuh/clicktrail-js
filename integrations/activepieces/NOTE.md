# NOTE

`src/lib/events.ts` contains PURE builders (zero `@activepieces` imports).
It deliberately mirrors `packages/n8n-nodes-clicktrail/src/events.ts` in shape
and event-name mapping so a future refactor can lift BOTH into
`@vizuh/clicktrail` as one shared builder layer. Do not add framework types or
helpers here; keep validation + naming only.

## Release gate

This package is intentionally excluded from the root workspace and release
lock. The current Activepieces SDK chain includes high-severity advisories
with no patched `expr-eval` release. Re-enable it only after the upstream
dependency chain is fixed and `pnpm audit --prod --audit-level high` passes.
