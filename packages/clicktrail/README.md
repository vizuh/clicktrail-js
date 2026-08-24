# @vizuh/clicktrail

Deterministic first-party attribution conventions and engine. Captures the
trail from ad click to conversion — UTMs, ad click IDs (gclid, fbclid,
ttclid, ...), referrer classification, first-touch/last-touch merge — as a
flat canonical payload.

The core engine is pure: same inputs always produce the same output. Time,
IDs, storage, consent, and network are supplied by callers, never requested.
That is what makes golden-fixture replay testing possible (see
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)).

Part of [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) by
Vizuh. FunnelSheet is Vizuh's consulting branch. The WordPress plugin is the
WordPress distribution; this package is the shared engine beneath it.

## Install

```bash
pnpm add @vizuh/clicktrail
# or: npm install @vizuh/clicktrail
```

Requires Node >= 18.

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

## License

MIT — see [LICENSE](LICENSE). The WordPress plugin remains
GPL-2.0-or-later; MIT embeds cleanly into GPL.
