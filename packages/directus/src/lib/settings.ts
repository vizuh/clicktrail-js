/**
 * Settings validation for the settings module (P3).
 *
 * Pure. The module component calls validateSettings before emitting `save`;
 * the HOST performs the actual Directus API persistence — this package only
 * validates and normalizes the shape.
 */

export interface ClickTrailSettings {
  siteId: string;
  endpoint: string;
  /** Masked display form of the collector API key ('abcd…wxyz'). */
  apiKeyMasked: string;
  consentRequired: boolean;
  fieldMappings: Record<string, string>;
}

export interface SettingsValidation {
  valid: boolean;
  errors: string[];
  normalized?: ClickTrailSettings | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Mask an API key for display: keep first/last two chars when long enough. */
export function maskApiKey(key: unknown): string {
  if (typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed === '') return '';
  if (trimmed.length <= 6) return '••••••';
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}

/**
 * Validate loose settings input.
 *
 * Rules:
 * - siteId: required non-empty string.
 * - endpoint: optional, but when present must be an http(s) URL.
 * - apiKeyMasked: display-only; any non-string is coerced at normalize time.
 * - consentRequired: optional boolean, default false.
 * - fieldMappings: optional record of string -> string, default {}.
 */
export function validateSettings(input: unknown): SettingsValidation {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: ['settings must be an object.'] };
  }

  const siteId = typeof input['siteId'] === 'string' ? input['siteId'].trim() : '';
  if (siteId === '') errors.push('siteId is required.');

  const endpoint = typeof input['endpoint'] === 'string' ? input['endpoint'].trim() : '';
  if (endpoint !== '') {
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      parsedUrl = null;
    }
    if (parsedUrl === null || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
      errors.push('endpoint must be a valid http(s) URL.');
    }
  }

  const consentRequiredRaw = input['consentRequired'];
  if (
    consentRequiredRaw !== undefined &&
    consentRequiredRaw !== null &&
    typeof consentRequiredRaw !== 'boolean'
  ) {
    errors.push('consentRequired must be a boolean.');
  }

  let fieldMappingsValid = true;
  if (input['fieldMappings'] !== undefined && input['fieldMappings'] !== null) {
    if (!isRecord(input['fieldMappings'])) {
      fieldMappingsValid = false;
    } else {
      for (const value of Object.values(input['fieldMappings'])) {
        if (typeof value !== 'string') fieldMappingsValid = false;
      }
    }
  }
  if (!fieldMappingsValid) errors.push('fieldMappings must be a record of string keys to string values.');

  if (errors.length > 0) return { valid: false, errors };

  const mappings: Record<string, string> = {};
  const rawMappings = isRecord(input['fieldMappings']) ? input['fieldMappings'] : {};
  for (const key of Object.keys(rawMappings).sort()) {
    mappings[key] = String(rawMappings[key]);
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      siteId,
      endpoint,
      apiKeyMasked: maskApiKey(input['apiKeyMasked']),
      consentRequired: consentRequiredRaw === true,
      fieldMappings: mappings,
    },
  };
}
