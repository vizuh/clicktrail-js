/**
 * Deterministic field sanitization. No truncation surprises: limits are fixed.
 */

const MAX_FIELD_LENGTH = 512;

/** Strip control characters, trim, and cap length. Empty/nullish -> ''. */
export function sanitizeField(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length > MAX_FIELD_LENGTH) return cleaned.slice(0, MAX_FIELD_LENGTH);
  return cleaned;
}

/** Normalize a host for comparison: lowercase, strip leading www. and port. */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '');
  const slash = h.indexOf('/');
  if (slash !== -1) h = h.slice(0, slash);
  const colon = h.indexOf(':');
  if (colon !== -1) h = h.slice(0, colon);
  if (h.startsWith('www.')) h = h.slice(4);
  return h;
}

/** True when `host` equals or is a subdomain of `base`. */
export function hostMatches(host: string, base: string): boolean {
  const h = normalizeHost(host);
  const b = normalizeHost(base);
  if (!h || !b) return false;
  return h === b || h.endsWith(`.${b}`);
}
