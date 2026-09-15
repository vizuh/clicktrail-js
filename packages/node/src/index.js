const IDS = ['gclid','gbraid','wbraid','fbclid','fbc','fbp','msclkid','ttclid','li_fat_id'];
export function getClickIds(request = {}) { const query = request.query || Object.fromEntries(new URL(request.url || 'http://localhost').searchParams); return Object.fromEntries(IDS.flatMap((key) => query[key] ? [[key, String(query[key]).slice(0, 512)]] : [])); }
export function attachClickIds(record = {}, clickIds = {}) { return { ...record, attribution: Object.fromEntries(IDS.flatMap((key) => clickIds[key] ? [[key, String(clickIds[key]).slice(0, 512)]] : [])) }; }
export function idempotencyKey(source, id, event = 'conversion') { return `${String(source)}:${String(id)}:${event}`.replace(/[^A-Za-z0-9:_-]/g, '_'); }
