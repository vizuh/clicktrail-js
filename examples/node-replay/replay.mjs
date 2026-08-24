/**
 * ClickTrail deterministic replay — Node, zero dependencies (node >= 18).
 *
 * Imports the BUILT stable entry point directly by relative path so no
 * install step is needed. Run from anywhere:
 *
 *   node examples/node-replay/replay.mjs
 *
 * (build first if dist/ is missing: `pnpm --filter @vizuh/clicktrail build`)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// The package is ESM-only; resolve its real path so a bare relative import
// works regardless of where node is invoked from.
const pkgPath = join(here, '../../packages/clicktrail/dist/index.js');
const {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
  stampVersions,
} = await import(pkgPath).catch((error) => {
  throw new Error(
    `Cannot load ${pkgPath}. Build it first:\n  pnpm --filter @vizuh/clicktrail build\n`,
    { cause: error },
  );
});

// Three hardcoded landing fixtures. The engine is pure: same inputs always
// produce byte-identical payloads, which is what makes replay testing work.
const FIXTURES = [
  {
    label: 'Google Ads click',
    input: {
      url: 'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring-25&gclid=EAIaIQobChMItest',
      referrer: 'https://www.google.com/',
      currentHost: 'example.com',
      now: '2026-08-24T10:00:00.000Z', // caller owns the clock
    },
  },
  {
    label: 'Meta social campaign',
    input: {
      url: 'https://example.com/?utm_source=facebook&utm_medium=paid-social&utm_campaign=retarget-q3&utm_content=carousel-a&fbclid=IwAR2demo',
      referrer: 'https://l.facebook.com/',
      currentHost: 'example.com',
      now: '2026-08-24T11:30:00.000Z',
    },
  },
  {
    label: 'Organic referral (no UTMs)',
    input: {
      url: 'https://example.com/docs/getting-started',
      referrer: 'https://duckduckgo.com/',
      currentHost: 'example.com',
      now: '2026-08-24T14:05:00.000Z',
    },
  },
];

for (const fixture of FIXTURES) {
  const result = parseAttributionUrl(fixture.input);

  console.log(`## ${fixture.label}`);
  if (result.kind !== 'touch') {
    console.log(JSON.stringify({ kind: result.kind, reason: result.reason }));
    continue;
  }

  // Fresh "stored" payload + merge the parsed touch, then stamp versions.
  const payload = stampVersions(
    mergeAttributionTouch(emptyAttribution(), result.touch),
  );

  console.log(JSON.stringify(payload, null, 2));
}
