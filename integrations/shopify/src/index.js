const KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'msclkid', 'ttclid', 'li_fat_id'];
const JS_UNSAFE_CHAR_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
function escapeUnsafeChars(str) {
  return str.replace(/[<>/\\\b\f\n\r\t\0\u2028\u2029]/g, (ch) => JS_UNSAFE_CHAR_MAP[ch]);
}
export function extractOrderAttribution(order = {}) {
  const attrs = Object.fromEntries((Array.isArray(order.note_attributes) ? order.note_attributes : []).filter((x) => x && typeof x.name === 'string').map((x) => [x.name, String(x.value ?? '')]));
  return Object.fromEntries(KEYS.flatMap((key) => attrs[key] ? [[key, attrs[key].slice(0, 512)]] : []));
}
export function createWebPixelScript({ eventName = 'page_viewed', cookieName = 'ct_attribution' } = {}) {
  if (!/^[A-Za-z0-9_.-]+$/.test(eventName) || !/^[A-Za-z0-9_-]+$/.test(cookieName)) throw new TypeError('invalid Shopify event or cookie name');
  return `analytics.subscribe(${escapeUnsafeChars(JSON.stringify(eventName))}, (event) => { const url = new URL(event.context.document.location.href); const ids = {}; for (const key of ${escapeUnsafeChars(JSON.stringify(KEYS))}) { const value = url.searchParams.get(key); if (value) ids[key] = value.slice(0, 512); } if (Object.keys(ids).length) document.cookie = ${escapeUnsafeChars(JSON.stringify(cookieName))} + '=' + encodeURIComponent(JSON.stringify(ids)) + '; Path=/; SameSite=Lax; Secure'; });`;
}
export function normalizeShopifyOrder(order = {}) { return { eventId: `shopify_order_${order.id}`, eventName: 'Purchase', value: Number(order.current_total_price ?? order.total_price ?? 0), currency: order.currency || order.presentment_currency, attribution: extractOrderAttribution(order) }; }
