export const CLICK_ID_KEYS = Object.freeze(['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id']);
export const DEFAULT_COOKIE_NAME = 'ct_attribution';

export function captureAttribution(input) {
  const source = input instanceof URLSearchParams ? input : new URLSearchParams(String(input || '').replace(/^\?/, ''));
  return Object.fromEntries(CLICK_ID_KEYS.flatMap((key) => { const value = source.get(key)?.trim(); return value ? [[key, value.slice(0, 512)]] : []; }));
}

export function serializeAttributionCookie(value, { name = DEFAULT_COOKIE_NAME, maxAge = 7776000 } = {}) {
  if (!value || typeof value !== 'object') throw new TypeError('attribution must be an object');
  return `${name}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`;
}

export function parseAttributionCookie(header, name = DEFAULT_COOKIE_NAME) {
  const match = String(header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return {};
  try { const parsed = JSON.parse(decodeURIComponent(match.slice(name.length + 1))); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

export function captureFromNextRequest(request) {
  const url = request?.nextUrl || request?.url;
  const search = url instanceof URL ? url.searchParams : new URL(String(url || 'http://localhost')).searchParams;
  return captureAttribution(search);
}

export function createHiddenFields(attribution) {
  return Object.entries(attribution || {}).filter(([key, value]) => CLICK_ID_KEYS.includes(key) && value).map(([name, value]) => ({ name, value: String(value) }));
}

export function createMiddleware({ cookieName = DEFAULT_COOKIE_NAME, maxAge } = {}) {
  return function clickTrailMiddleware(request, NextResponse) {
    const attribution = captureFromNextRequest(request);
    const response = NextResponse.next();
    if (Object.keys(attribution).length && request?.consent?.advertising !== false) response.cookies.set(cookieName, JSON.stringify(attribution), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: maxAge ?? 7776000, path: '/' });
    return response;
  };
}

export async function getAttributionFromCookies(cookieStore, name = DEFAULT_COOKIE_NAME) {
  const item = await cookieStore?.get?.(name);
  if (!item?.value) return {};
  try { const parsed = JSON.parse(item.value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

export async function attachAttribution(formData, cookieStore, name = DEFAULT_COOKIE_NAME) {
  const attribution = await getAttributionFromCookies(cookieStore, name);
  return { attribution, formData: formData instanceof FormData ? Object.fromEntries(formData.entries()) : { ...(formData || {}) } };
}
