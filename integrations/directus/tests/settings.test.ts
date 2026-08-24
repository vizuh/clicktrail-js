import { describe, expect, it } from 'vitest';
import { maskApiKey, validateSettings } from '../src/lib/settings.js';

describe('maskApiKey', () => {
  it('keeps first/last two chars of long keys and blanks short/invalid ones', () => {
    expect(maskApiKey('abcdefgh')).toBe('ab…gh');
    expect(maskApiKey('abc')).toBe('••••••');
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey(undefined)).toBe('');
    expect(maskApiKey(123)).toBe('');
  });
});

describe('validateSettings', () => {
  it('accepts a full valid settings object and normalizes mappings order', () => {
    const result = validateSettings({
      siteId: ' site-1 ',
      endpoint: 'https://collector.test/collect',
      apiKeyMasked: 'abcd…wxyz',
      consentRequired: true,
      fieldMappings: { b: '2', a: '1' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.siteId).toBe('site-1');
    expect(result.normalized?.consentRequired).toBe(true);
    expect(Object.keys(result.normalized?.fieldMappings ?? {})).toEqual(['a', 'b']);
  });

  it('applies defaults: endpoint optional, consent false, mappings {}', () => {
    const result = validateSettings({ siteId: 's' });
    expect(result.valid).toBe(true);
    expect(result.normalized?.endpoint).toBe('');
    expect(result.normalized?.consentRequired).toBe(false);
    expect(result.normalized?.fieldMappings).toEqual({});
  });

  it('rejects missing siteId and non-object input', () => {
    expect(validateSettings({ endpoint: 'https://x.test' }).valid).toBe(false);
    expect(validateSettings(null).valid).toBe(false);
    expect(validateSettings('settings').valid).toBe(false);
    expect(validateSettings([]).valid).toBe(false);
  });

  it('rejects bad endpoint URLs and malformed fieldMappings', () => {
    expect(validateSettings({ siteId: 's', endpoint: 'notaurl' }).errors.join(' ')).toContain('endpoint');
    expect(
      validateSettings({ siteId: 's', endpoint: 'ftp://x.test' }).errors.join(' '),
    ).toContain('http(s)');
    const badMappings = validateSettings({ siteId: 's', fieldMappings: { a: 1 } });
    expect(badMappings.valid).toBe(false);
    expect(badMappings.errors.join(' ')).toContain('fieldMappings');
    expect(validateSettings({ siteId: 's', fieldMappings: 'nope' }).valid).toBe(false);
  });
});
