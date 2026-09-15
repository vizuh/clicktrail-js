const IDS = ['gclid','gbraid','wbraid','fbclid','fbc','fbp','msclkid','ttclid','li_fat_id'];
const LEGACY_KEY_COMPONENT = /^[A-Za-z0-9_-]+$/;

export function getClickIds(request = {}) { const query = request.query || Object.fromEntries(new URL(request.url || 'http://localhost').searchParams); return Object.fromEntries(IDS.flatMap((key) => query[key] ? [[key, String(query[key]).slice(0, 512)]] : [])); }
export function attachClickIds(record = {}, clickIds = {}) { return { ...record, attribution: Object.fromEntries(IDS.flatMap((key) => clickIds[key] ? [[key, String(clickIds[key]).slice(0, 512)]] : [])) }; }

function encodeKeyComponent(value) {
  let hex = '';
  for (let index = 0; index < value.length; index += 1) hex += value.charCodeAt(index).toString(16).padStart(4, '0');
  return `${value.length}:${hex}`;
}

export function idempotencyKey(source, id, event = 'conversion') {
  const parts = [String(source), String(id), String(event)];
  // Keep the established shape for ordinary provider IDs. Delimiter-bearing or
  // otherwise unsafe components use an injective, length-delimited v2 shape.
  if (parts.every((part) => LEGACY_KEY_COMPONENT.test(part))) return parts.join(':');
  return `v2|${parts.map(encodeKeyComponent).join('|')}`;
}
