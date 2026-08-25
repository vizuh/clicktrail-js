/**
 * Headers never forwarded upstream by the first-party proxy.
 *
 * Visitor IPs must not leak to third parties through the proxy path; the
 * forward list is an allowlist AND this denylist wins over anything else.
 */

export const FORBIDDEN_FORWARD_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'forwarded',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
]);
