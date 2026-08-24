/**
 * Pure UUID v4 formatting from caller-provided randomness. No clock, no
 * globals — the random source is always injected (frozen-core rule).
 */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('uuidV4FromBytes needs 16 bytes');
  const b = bytes.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}` +
    `-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}
