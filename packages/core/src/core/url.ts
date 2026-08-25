function isNonPublicIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isNonPublicIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;
  return (
    host === '::' ||
    host === '::1' ||
    host.startsWith('::ffff:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    /^fe[89ab]/.test(host) ||
    host.startsWith('ff') ||
    host.startsWith('2001:db8:')
  );
}

/**
 * Validate a server-side collector destination without performing DNS.
 * HTTPS, credentials-free, globally addressable hosts only. Deployments
 * should also enforce an outbound allowlist to prevent DNS rebinding.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || !hostname || url.username || url.password) return false;
    if (
      hostname === 'localhost' ||
      ['.localhost', '.local', '.internal', '.home', '.lan'].some((suffix) => hostname.endsWith(suffix))
    ) {
      return false;
    }
    if (!hostname.includes('.') && !hostname.includes(':')) return false;
    return !isNonPublicIpv4(hostname) && !isNonPublicIpv6(hostname);
  } catch {
    return false;
  }
}
