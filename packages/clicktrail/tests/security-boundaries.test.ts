import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseAttributionUrl, referrerHostOf } from '../src/core/parse.js';

describe('input security boundaries', () => {
  it('never throws for arbitrary untrusted URL input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2048 }), (url) => {
        expect(() => parseAttributionUrl({ url })).not.toThrow();
      }),
    );
  });

  it('does not treat non-web referrers as external hosts', () => {
    expect(referrerHostOf('javascript:alert(1)')).toBe('');
    expect(referrerHostOf('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(referrerHostOf('file:///etc/passwd')).toBe('');
  });
});
