# NOTE

`src/lib/events.ts` contains PURE builders (zero `@activepieces` imports).
It deliberately mirrors `packages/n8n-nodes-clicktrail/src/events.ts` in shape
and event-name mapping so a future refactor can lift BOTH into
`@vizuh/clicktrail` as one shared builder layer. Do not add framework types or
helpers here; keep validation + naming only.
