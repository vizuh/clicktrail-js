/**
 * Deterministic field sanitization. No truncation surprises: limits are fixed.
 *
 * WP-parity rulings (docs/WP-PARITY-DRAFT.md):
 * - Uniform 512 length cap kept; plugin two-pass 128/256 = accident (#14/#16).
 * - Control characters DELETED (not space-replaced).
 * - Values matching the unsubstituted-template-macro pattern '{{...}}'
 *   are rejected outright (#15) — ad-platform macros pollute reports.
 */

const MAX_FIELD_LENGTH = 512;

/** Unsubstituted ad-platform macro guard: e.g. {{campaign.name}}, {{adset.name}}. */
const MACRO_PATTERN = /^\{\{.+\}\}$/;

/** Strip control characters and template macros, trim, and cap length. Empty/nullish -> ''. */
export function sanitizeField(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || MACRO_PATTERN.test(cleaned)) return '';
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

/**
 * SYMMETRIC related-host check (ruling #8): true when either host equals or
 * is a subdomain of the other. Sibling-subdomain journeys
 * (shop.site.com <-> site.com) must not create fake referral touches.
 */
export function areRelatedHosts(firstHost: string, secondHost: string): boolean {
  const a = normalizeHost(firstHost);
  const b = normalizeHost(secondHost);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
