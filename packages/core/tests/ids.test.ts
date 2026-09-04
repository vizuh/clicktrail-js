import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveStableEventId } from '../src/ids.js';

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/stable-event-id-v1.json', import.meta.url), 'utf8'),
) as {
  algorithm: string;
  vectors: { siteId: string; externalKey: string; eventId: string }[];
};

describe('deriveStableEventId', () => {
  it('matches the shared SHA-256/128 cross-runtime vectors', () => {
    expect(fixture.algorithm).toBe('sha256-128-v1');
    for (const vector of fixture.vectors) {
      expect(deriveStableEventId(vector.siteId, vector.externalKey)).toBe(vector.eventId);
    }
    expect(deriveStableEventId('site-1', 'booking-1:completed')).toMatch(
      /^evt_s-[0-9a-f]{32}$/,
    );
  });

  it('separates distinct inputs from known 32-bit FNV-1a collision pairs', () => {
    expect(deriveStableEventId('site-1', 'xXQY9Q9m8YsVb0LI')).not.toBe(
      deriveStableEventId('site-1', 'GSpqZXJtjd9IBZ6f'),
    );
  });

  it('rejects empty scope components', () => {
    expect(() => deriveStableEventId('', 'event-1')).toThrow(/non-empty/);
    expect(() => deriveStableEventId('site-1', '')).toThrow(/non-empty/);
  });
});
