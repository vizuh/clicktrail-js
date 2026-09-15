const IDS = ['gclid','gbraid','wbraid','fbclid','fbc','fbp','msclkid','ttclid','li_fat_id'];
export function extractWordPressAttribution(fields = {}) { return Object.fromEntries(IDS.flatMap((key) => fields[key] ? [[key, String(fields[key]).slice(0, 512)]] : [])); }
export function buildWordPressHiddenFields(attribution = {}) { return Object.entries(extractWordPressAttribution(attribution)).map(([name, value]) => ({ name: `clicktrail_${name}`, value })); }
