import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl } from '../src/core/url.js';

describe('isSafeHttpUrl', () => {
  it.each([
    'http://collector.example.com/events',
    'https://localhost/events',
    'https://service.internal/events',
    'https://127.0.0.1/events',
    'https://127.1/events',
    'https://10.0.0.1/events',
    'https://169.254.169.254/latest/meta-data',
    'https://192.0.0.1/events',
    'https://192.0.1.1/events',
    'https://192.168.1.2/events',
    'https://[::1]/events',
    'https://[fd00::1]/events',
    'https://user:pass@collector.example.com/events',
  ])('rejects non-public server destinations: %s', (url) => {
    expect(isSafeHttpUrl(url)).toBe(false);
  });

  it('accepts a credentials-free public HTTPS destination', () => {
    expect(isSafeHttpUrl('https://collector.example.com/v1/events')).toBe(true);
  });
});
