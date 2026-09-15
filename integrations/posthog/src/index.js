const CLICK_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'msclkid', 'ttclid', 'li_fat_id'];
export function enrichPostHogEvent(event, attribution, { includeRaw = false, prefix = 'clicktrail_' } = {}) {
  const properties = { ...(event?.properties || {}) };
  for (const key of CLICK_KEYS) if (attribution?.[key]) properties[`${prefix}${key}`] = String(attribution[key]);
  if (includeRaw && attribution && typeof attribution === 'object') properties[`${prefix}attribution`] = { ...attribution };
  return { ...event, properties };
}
export function createPostHogPlugin({ getAttribution, includeRaw = false, prefix } = {}) {
  return { name: 'clicktrail-attribution', processEvent: (event) => enrichPostHogEvent(event, getAttribution?.() || {}, { includeRaw, prefix }) };
}
export function toConversionEvent(event, { eventId, value, currency } = {}) {
  const enriched = enrichPostHogEvent(event, event?.properties || {});
  return { eventId: eventId || event?.uuid || event?.distinct_id, eventName: event?.event, occurredAt: event?.timestamp, value: value ?? event?.properties?.revenue, currency: currency || event?.properties?.currency, attribution: Object.fromEntries(CLICK_KEYS.filter((key) => enriched.properties?.[`clicktrail_${key}`]).map((key) => [key, enriched.properties[`clicktrail_${key}`]])) };
}
