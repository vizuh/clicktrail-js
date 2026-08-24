/**
 * Legacy global adapter: getData/getField/clearData/getSession over a
 * fixture-derived payload. Pure factory — no window access anywhere here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '@vizuh/clicktrail-core';
import { emptyAttribution, mergeAttributionTouch } from '@vizuh/clicktrail-core';
import { createLegacyGlobal } from '../src/browser/global-adapter.js';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import { dataLayerDestination } from '../src/browser/transport.js';

const fxDir = join(dirname(fileURLToPath(import.meta.url)), '../../clicktrail/fixtures');
const fixture = JSON.parse(
  readFileSync(join(fxDir, 'meta-paid-fbclid-only.json'), 'utf8'),
) as { input: Parameters<typeof parseAttributionUrl>[0]; expected: Record<string, string> };

function makeInstance() {
  const ct = createClickTrail({ destinations: [dataLayerDestination()] });
  const parsed = parseAttributionUrl(fixture.input);
  if (parsed.kind !== 'touch') throw new Error('fixture must produce a touch');
  ct.mergeParsedTouch(parsed.touch);
  return ct;
}

describe('createLegacyGlobal', () => {
  it('exposes getData over a fixture payload', () => {
    const api = createLegacyGlobal(makeInstance());
    const data = api.getData();
    for (const [key, value] of Object.entries(fixture.expected)) {
      if (key.startsWith('_')) continue; // classification metadata, not payload
      expect(data[key], key).toBe(value);
    }
  });

  it('exposes getField for individual canonical keys', () => {
    const api = createLegacyGlobal(makeInstance());
    expect(api.getField('fbclid')).toBe(fixture.expected['fbclid']);
    expect(api.getField('ft_medium')).toBe(fixture.expected['ft_medium']);
    expect(api.getField('nonexistent_key')).toBe('');
  });

  it('clearData resets to the empty canonical payload', () => {
    const api = createLegacyGlobal(makeInstance());
    api.clearData();
    expect(api.getData()).toEqual(emptyAttribution());
    expect(api.getField('fbclid')).toBe('');
  });

  it('getSession returns a snapshot shape (empty until Phase 2 fills IDs)', () => {
    const api = createLegacyGlobal(makeInstance());
    expect(api.getSession()).toEqual({
      visitorId: '',
      sessionId: '',
      sessionNumber: '',
    });
  });
});
