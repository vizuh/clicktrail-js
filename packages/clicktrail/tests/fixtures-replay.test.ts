/**
 * Golden-fixture replay: the fixtures ARE the executable spec.
 * Every fixture replays parse + merge against the engine and must match
 * field-for-field on the `expected` subset.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { emptyAttribution, mergeAttributionTouch } from '../src/core/merge.js';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

const cases = readdirSync(fxDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(fxDir, f), 'utf8')));

describe.each(cases)('fixture: $name', ({ input, expected }) => {
  it('replays field-for-field', () => {
    const parsed = parseAttributionUrl(input);

    if (expected._no_touch_reason) {
      expect(parsed).toEqual({ kind: 'none', reason: expected._no_touch_reason });
      return;
    }

    expect(parsed.kind).toBe('touch');
    if (parsed.kind !== 'touch') return;

    if (expected._channel) {
      expect(parsed.touch.channel).toBe(expected._channel);
    }

    const payload = mergeAttributionTouch(emptyAttribution(), parsed.touch);
    for (const [key, value] of Object.entries(expected)) {
      if (key.startsWith('_')) continue;
      expect(payload[key], `${key}`).toBe(value);
    }
  });
});
