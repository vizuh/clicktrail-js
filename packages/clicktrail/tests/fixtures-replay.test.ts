/**
 * Golden-fixture replay: the fixtures ARE the executable spec.
 * Every fixture replays parse + merge against the engine and must match
 * field-for-field on the `expected` subset.
 *
 * Schema (extended per docs/internal/WP-PARITY-DRAFT.md harness note):
 * - `input`: ParseAttributionInput.
 * - optional `stored`: pre-existing canonical payload. It is merged with
 *   emptyAttribution() and fed to mergeAttributionTouch BEFORE the parsed
 *   touch, so merge-level scenarios (first-touch guard) are deterministic.
 * - `expected`: subset of payload keys asserted after replay; `_channel`
 *   asserts the machine enum on the parsed touch; `_no_touch_reason` asserts
 *   a non-touch result instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '@vizuh/clicktrail-core';
import { emptyAttribution, mergeAttributionTouch } from '@vizuh/clicktrail-core';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

interface FixtureCase {
  name: string;
  input: Record<string, unknown>;
  stored?: Record<string, string>;
  expected: Record<string, string>;
}

// Recurse one level so wp-parity-drafts/ stays a separate, named suite.
function loadFixtures(dir: string): FixtureCase[] {
  const out: FixtureCase[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...loadFixtures(full));
    } else if (entry.name.endsWith('.json')) {
      out.push(JSON.parse(readFileSync(full, 'utf8')));
    }
  }
  return out;
}

const cases = loadFixtures(fxDir);

describe.each(cases)('fixture: $name', ({ input, stored, expected }) => {
  it('replays field-for-field', () => {
    const parsed = parseAttributionUrl(input as never);

    if (expected._no_touch_reason) {
      expect(parsed).toEqual({ kind: 'none', reason: expected._no_touch_reason });
      return;
    }

    expect(parsed.kind).toBe('touch');
    if (parsed.kind !== 'touch') return;

    if (expected._channel) {
      expect(parsed.touch.channel).toBe(expected._channel);
    }

    let payload = emptyAttribution();
    if (stored) payload = mergeAttributionTouch({ ...payload, ...stored }, parsed.touch);
    else payload = mergeAttributionTouch(payload, parsed.touch);
    for (const [key, value] of Object.entries(expected)) {
      if (key.startsWith('_')) continue;
      expect(payload[key], `${key}`).toBe(value);
    }
  });
});
