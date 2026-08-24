import { describe, expect, it } from 'vitest';
import {
  API_KEY_HEADER,
  ClickTrailApi,
  DEFAULT_TIMEOUT_MS,
  buildRequestHeaders,
  validateCollectorUrl,
} from '../src/credentials/ClickTrailApi.credentials.js';

describe('validateCollectorUrl (https enforcement)', () => {
  it('accepts valid https collector endpoints and preserves the path', () => {
    const url = validateCollectorUrl('https://collector.example.com/v1/events');
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/v1/events');
  });

  it('rejects http, ftp, garbage, and empty values', () => {
    expect(() => validateCollectorUrl('http://collector.example.com')).toThrow(/must use https/);
    expect(() => validateCollectorUrl('ftp://collector.example.com')).toThrow(TypeError);
    expect(() => validateCollectorUrl('not a url')).toThrow(TypeError);
    expect(() => validateCollectorUrl('')).toThrow(/non-empty/);
    expect(() => validateCollectorUrl(undefined)).toThrow(TypeError);
    expect(() => validateCollectorUrl(null)).toThrow(TypeError);
  });
});

describe('buildRequestHeaders (api key wiring)', () => {
  it('always sets json content type', () => {
    expect(buildRequestHeaders()['content-type']).toBe('application/json');
  });

  it('sends X-ClickTrail-Key only when an api key is configured', () => {
    const withKey = buildRequestHeaders('secret-key');
    expect(withKey[API_KEY_HEADER]).toBe('secret-key');

    expect(API_KEY_HEADER in buildRequestHeaders('')).toBe(false);
    expect(API_KEY_HEADER in buildRequestHeaders('   ')).toBe(false);
    expect(API_KEY_HEADER in buildRequestHeaders(undefined)).toBe(false);
    // Non-string credential state must not crash header assembly.
    expect(API_KEY_HEADER in buildRequestHeaders(42)).toBe(false);
  });
});

describe('credential declaration', () => {
  it('exposes baseUrl, optional apiKey, and a 10s default timeout', () => {
    const cred = new ClickTrailApi();
    expect(cred.name).toBe('clickTrailApi');
    const byName = new Map(cred.properties.map((p) => [p.name, p]));
    expect(byName.get('baseUrl')?.required).toBe(true);
    expect(byName.get('apiKey')?.required).toBeFalsy();
    // Modern n8n-workflow expresses password fields as string + password typeOption.
    expect(byName.get('apiKey')?.type).toBe('string');
    expect((byName.get('apiKey')?.typeOptions as Record<string, unknown> | undefined)?.['password']).toBe(true);
    expect(byName.get('timeout')?.default).toBe(DEFAULT_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});
