# @vizuh/clicktrail

![ClickTrail](https://ps.w.org/click-trail-handler/assets/icon-256x256.png)

Deterministic first-party attribution conventions and engine. Captures the
trail from ad click to conversion — UTMs, ad click IDs (gclid, fbclid,
ttclid, ...), referrer classification, first-touch/last-touch merge — as a
flat canonical payload.

The core engine is pure: same inputs always produce the same output. Time,
IDs, storage, consent, and network are supplied by callers, never requested.
That is what makes golden-fixture replay testing possible (see the
[architecture docs](https://github.com/vizuh/clicktrail-js/blob/master/docs/ARCHITECTURE.md)).

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by
Vizuh. FunnelSheet is Vizuh's consulting branch. The WordPress plugin is the
WordPress distribution; this package is the shared engine beneath it.

> Release candidate: `0.1.0-rc.1`. The matching GitHub tag publishes this
> package to npm under the `next` dist-tag.

## Install

```bash
pnpm add @vizuh/clicktrail
# or: npm install @vizuh/clicktrail
```

Requires Node >= 18. This is an ESM-only package; use `import` or dynamic
`import()`. CommonJS `require()` is not supported.

The package ships declaration files for the root and every exported subpath,
so TypeScript consumers can typecheck against the same public entry points.

## Entry points

| Import | Status | Use |
|---|---|---|
| `@vizuh/clicktrail` | Stable | Pure parser, merge engine, constants, types |
| `@vizuh/clicktrail/browser` | Stable adapter | Browser lifecycle, storage, forms, dataLayer, HTTP |
| `@vizuh/clicktrail/conversation` | Incubating | Journey and conversation metadata |
| `@vizuh/clicktrail/agent` | Incubating | Metadata-only agent-run and tool summaries |
| `@vizuh/clicktrail/otel` | Incubating | Trace-context helpers and destination |
| `@vizuh/clicktrail/apointoo` | Incubating | Apointoo outcome delivery |
| `@vizuh/clicktrail/incubating` | Incubating | Experimental constants |

Incubating entry points can change between minor versions. Keep them behind a
host adapter until their contracts are stabilized.

## Common use cases

- parse and classify campaign context in a deterministic server or build step;
- preserve attribution in a browser integration that owns its storage and consent gate;
- inject `ct_*` fields into forms when the host controls the DOM;
- push canonical events to a site-owned GTM `dataLayer`.

## Usage

### Stable entry point (`@vizuh/clicktrail`)

Stable constants, types, and the pure core engine. Protected by semver 2.0:
breaking changes only in major releases.

```ts
import {
  parseAttributionUrl,
  emptyAttribution,
  mergeAttributionTouch,
  stampVersions,
} from '@vizuh/clicktrail';

// All inputs come from the caller; nothing here reads the clock or network.
const landingUrl =
  'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=EAIa...';

const result = parseAttributionUrl({
  url: landingUrl,
  referrer: 'https://www.google.com/',
  currentHost: 'example.com',
  now: '2026-08-23T10:00:00Z', // caller owns the clock
});

if (result.kind === 'touch') {
  const stored = emptyAttribution();
  const payload = stampVersions(mergeAttributionTouch(stored, result.touch));
  // payload now holds ft_* / lt_* fields plus schema_version + classifier_version
}
```

### Browser capture and form fields

The browser entry point keeps effects behind the host configuration. Replace the
example consent function with the site's real consent source before use.

```ts
import {
  createClickTrail,
  dataLayerDestination,
} from '@vizuh/clicktrail/browser';

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => true,
  storage: {
    cookieAttrs: { path: '/', sameSite: 'Lax', secure: true },
  },
  forms: {},
});

clickTrail.start();
```

Each tracked event keeps its backward-compatible flat payload and adds a
`marketing_trail` envelope. The envelope contains `evt_`, `trl_`,
`anon_`, and lead IDs, latest-touch attribution with first-touch fallback,
click IDs, consent, and form context. `workspaceId` and `siteId` are
optional config values; `trail_id` is a stable `trl_` namespace derived
from the persistent visitor ID.

```ts
const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  workspaceId: 'ws_123',
  siteId: 'site_123',
  consentState: () => ({ analytics: true, advertising: true }),
  storage: {},
});
```

The snippet shows the integration boundary only. Validate granted, denied,
withdrawn, cached-page, and dynamic-form paths in the host application.

For cross-domain continuity, `storage` is required when using the default
signer/verifier. Separate origins need a shared signing key or matching
explicit `sign` and `verify` functions. The HTTP destination exposes
`onDropped` for host-owned alerting or bounded recovery; it does not retry.

### AI workflow boundary (`/agent` and `/conversation`)

Agent events accept only fixed metadata fields. Prompts, completions, messages,
transcripts, tool arguments, and tool results are not accepted by the recorder.
Tool summaries are allowlisted to tool name, success, duration, and stable error
code.

```ts
import { createAgentRunRecorder } from '@vizuh/clicktrail/agent';

const recorder = createAgentRunRecorder({ emit: sendMetadataEvent });
const run = recorder.start({
  agentId: 'qualifier',
  agentName: 'Lead qualifier',
  startTime: new Date().toISOString(),
});
run.recordToolCall({ tool: 'crm.lookup', ok: true, durationMs: 42 });
run.finish({ endTime: new Date().toISOString(), ok: true });
```

Conversation content is dropped by default. If a product explicitly needs
content, `captureContent: true` requires a host redaction function first; do
not pass raw model or customer content to metadata fields.

### Incubating entry point (`@vizuh/clicktrail/incubating`)

UNSTABLE. May break between minor versions — same guidance as OpenTelemetry:
do not depend on it from published libraries; copy definitions into your
codebase instead.

```ts
import {
  ATTR_JOURNEY_ID,
  ATTR_CONVERSATION_ID,
  ACTOR_TYPE_VALUE_AGENT,
} from '@vizuh/clicktrail/incubating';
```

## Conventions

Constants follow the OpenTelemetry naming scheme:
`ATTR_${name}`, `${NAME}_VALUE_${enum}`, `EVENT_${name}`. Every payload
carries two independent stamps:

- `schema_version` — additive changes only within a major;
- `classifier_version` — any classifier behavior change is a MAJOR release.

## WordPress plugin

The WordPress distribution of this engine is the
[ClickTrail plugin](https://wordpress.org/plugins/click-trail-handler/)
(`click-trail-handler`). Golden fixtures captured from the live plugin are
this repository's executable spec.

## Tutorials and boundaries

See the [tutorials](https://github.com/vizuh/clicktrail-js/blob/master/docs/TUTORIALS.md) for deterministic replay, browser
capture, forms, and `dataLayer` setup. This package does not inject provider
pixels or prove provider API acceptance.

## License

MIT — see [LICENSE](LICENSE). The WordPress plugin remains
GPL-2.0-or-later; MIT embeds cleanly into GPL.
