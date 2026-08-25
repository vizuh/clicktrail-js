# Upstream issue draft — `sv` community add-on contract

> Issue-first rule: this add-on is built against the sv add-on contract **as
> best known today**. Before this package ships anything stable, the drafted
> issue below should be filed against the sv repository so the community
> add-on shape is confirmed upstream.

## Title

Stabilize + document the community add-on contract (`defineAddon`) for third-party integrations

## Body

### Summary

We are building `@clicktrail/sv`, a community add-on that scaffolds
[ClickTrail](https://github.com/vizuh/clicktrail-js) first-party attribution
into SvelteKit projects. Today the add-on format is not documented as a
stable public API, so we mirror it structurally with zero `sv` imports:

```ts
export interface SvAddon {
  id: string;
  metadata: { name; description; keywords? };
  condition?: ({ kit }) => boolean;
  questions?: Array<{ id; question; type: 'string'; default?; required?; placeholder? }>;
  files?: Array<{ name; content: string | ((answers) => string | null) }>;
  postInstall?: string | ((answers) => string);
}
```

### Questions for the sv maintainers

1. Is the shape above (or which parts of it) intended to be the public
   community add-on contract?
2. How should add-ons merge into an existing `hooks.server.ts` / root layout
   instead of overwriting them — is there an official patch/append helper?
3. What is the blessed way to prompt for secrets/ids and write them into
   `.env` (we currently emit `.env.clicktrail` to avoid clobbering)?
4. Versioning expectation for add-ons while the contract moves?

### Our constraints

- Zero build-time dependency on `sv` internals so the add-on keeps building
  when sv changes.
- All generated content is pure `(answers) => string` functions so it can be
  unit-tested without a filesystem.
- The package is marked EXPERIMENTAL until the contract lands.

---
Filed-by placeholder: ClickTrail maintainers (Vizuh OÜ).
