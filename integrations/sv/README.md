# @vizuh/clicktrail-sv

**EXPERIMENTAL** — [Svelte CLI (`sv`)](https://sv.svelte.dev) community add-on for [ClickTrail](https://github.com/vizuh/clicktrail-js).

The `sv` community add-on contract is not stable upstream yet. This package mirrors it structurally with zero `sv` imports and **may change without a semver break while EXPERIMENTAL**. See [`UPSTREAM-ISSUE-DRAFT.md`](./UPSTREAM-ISSUE-DRAFT.md) for the issue-first path to confirming the real contract.

## What it scaffolds

Running this add-on against a SvelteKit project applies:

- `hooks.server.ts` — the `@vizuh/clicktrail-sveltekit` attribution handle (landing UTMs + click IDs into a first-party cookie, consent gating, optional first-party proxy)
- `src/routes/+layout.svelte` — root layout usage of the `ClickTrail` component (browser boot with `afterNavigate`)
- `.env.clicktrail` — `CLICKTRAIL_SITE_ID` placeholder (+ optional `CLICKTRAIL_UPSTREAM`)
- `src/routes/api/clicktrail-example/+server.ts` — example server-side conversion endpoint calling `trackConversion`

And prints the post-install hint:

```sh
npm i @vizuh/clicktrail-sveltekit
```

## Questions

| Key | Prompt | Default |
|---|---|---|
| `siteId` | Your ClickTrail site ID | empty — fill in later via `.env` |

## License

MIT

> **Distribution mirror.** Development happens in [vizuh/clicktrail-js](https://github.com/vizuh/clicktrail-js) (`integrations/sv`). PRs and issues go there.
