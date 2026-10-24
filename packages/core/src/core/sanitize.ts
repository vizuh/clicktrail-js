/**
 * Deterministic field sanitization. No truncation surprises: limits are fixed.
 *
 * WP-parity rulings (docs/internal/WP-PARITY-DRAFT.md):
 * - Uniform 512 length cap kept; plugin two-pass 128/256 = accident (#14/#16).
 * - Control characters DELETED (not space-replaced).
 * - Values matching the unsubstituted-template-macro pattern '{{...}}'
 *   are rejected outright (#15) — ad-platform macros pollute reports.
 *
 * Each rule has an opt-in alternative ({@link SanitizeFieldOptions}, #64) so
 * hosts with their own downstream limits can keep values as they define them.
 */
import type { SanitizeFieldOptions } from './types.js';

const MAX_FIELD_LENGTH = 512;

/** Unsubstituted ad-platform macro guard: e.g. {{campaign.name}}, {{adset.name}}. */
const MACRO_PATTERN = /^\{\{.+\}\}$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Strip control characters and template macros, trim, and cap length. Empty/nullish -> ''.
 * Defaults are the contract above; `options` opts into dropping a value with
 * control characters (checked after trimming), keeping `{{...}}` macros, a
 * different length limit, and dropping over-long values instead of truncating.
 */
export function sanitizeField(value: unknown, options: SanitizeFieldOptions = {}): string {
  if (typeof value !== 'string') return '';
  let cleaned: string;
  if (options.controlCharPolicy === 'drop') {
    cleaned = value.trim();
    if (CONTROL_CHAR.test(cleaned)) return '';
  } else {
    cleaned = value.replace(CONTROL_CHARS, '').trim();
  }
  if (!cleaned) return '';
  if (options.macroPolicy !== 'keep' && MACRO_PATTERN.test(cleaned)) return '';
  const max = isValidLength(options.maxFieldLength) ? options.maxFieldLength : MAX_FIELD_LENGTH;
  if (cleaned.length > max) return options.overLengthPolicy === 'drop' ? '' : cleaned.slice(0, max);
  return cleaned;
}

/** A usable `maxFieldLength`: a positive integer. Anything else keeps the 512 default. */
function isValidLength(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
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

/** Dotted hostname shape accepted in referrer host lists (WordPress plugin parity). */
const LISTED_HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Drop trailing dots with a linear scan. `replace(/\.+$/, '')` backtracks
 * quadratically on hosts with long interior dot runs.
 */
function stripTrailingDots(host: string): string {
  let end = host.length;
  while (end > 0 && host.charCodeAt(end - 1) === 0x2e) end--;
  return end === host.length ? host : host.slice(0, end);
}

/**
 * Normalize a caller-supplied referrer host list (WordPress plugin 1.11.0
 * `get_ignored_referrer_hosts` parity): non-strings are skipped, entries are
 * trimmed and lowercased, a URL is reduced to its host, trailing dots and a
 * leading `www.` are dropped, anything that is not a dotted hostname is
 * discarded, and duplicates collapse. Input order is kept.
 */
export function normalizeReferrerHosts(hosts: unknown): string[] {
  if (!Array.isArray(hosts)) return [];
  const out = new Set<string>();
  for (const entry of hosts) {
    if (typeof entry !== 'string') continue;
    let host = entry.trim().toLowerCase();
    if (host.includes('/')) {
      try {
        host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
      } catch {
        continue;
      }
    }
    host = stripTrailingDots(host).replace(/^www\./, '');
    if (LISTED_HOST_PATTERN.test(host)) out.add(host);
  }
  return Array.from(out);
}

/**
 * True when `host` equals or is a subdomain of any entry of `ignoredHosts`
 * (entries normalized with {@link normalizeReferrerHosts}). One-directional
 * like the plugin: `checkout.stripe.com` matches `stripe.com`, never the
 * reverse.
 */
export function isIgnoredReferrerHost(host: string, ignoredHosts: unknown): boolean {
  const h = stripTrailingDots(normalizeHost(host));
  if (!h) return false;
  return normalizeReferrerHosts(ignoredHosts).some((d) => h === d || h.endsWith(`.${d}`));
}
