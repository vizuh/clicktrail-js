import { parseAttributionUrl } from '@vizuh/clicktrail-core';

export const CLICK_ID_KEYS = Object.freeze(['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id']);
export const DEFAULT_COOKIE_NAME = 'ct_attribution';
export const DEFAULT_MAX_AGE = 90 * 24 * 60 * 60;

const TOUCH_FIELDS = Object.freeze([
  'source', 'medium', 'campaign', 'term', 'content', 'utmId',
  'utmSourcePlatform', 'utmCreativeFormat', 'utmMarketingTactic',
  'channelLabel', 'referrer', 'landingPage', 'touchTimestamp',
]);
const FIRST_TOUCH_KEYS = Object.freeze([
  ...TOUCH_FIELDS.map((field) => `ft_${field === 'channelLabel' ? 'channel' : field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`),
  ...CLICK_ID_KEYS.map((key) => `ft_${key}`),
]);
const ALLOWED_RECORD_KEYS = new Set([...FIRST_TOUCH_KEYS, ...CLICK_ID_KEYS]);

function bounded(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 512) : '';
}

function cleanRecord(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (!ALLOWED_RECORD_KEYS.has(key)) return [];
    const text = bounded(item);
    return text ? [[key, text]] : [];
  }));
}

function hasFirstTouch(value) {
  // Treat the pre-0.2 click-ID-only cookie as an existing first touch too;
  // an upgrade must not replace the original acquisition with a later visit.
  return FIRST_TOUCH_KEYS.some((key) => bounded(value?.[key])) || CLICK_ID_KEYS.some((key) => bounded(value?.[key]));
}

/**
 * Capture the legacy click-ID-only shape. Kept for backwards compatibility;
 * use captureFirstTouch() for a complete first-touch record.
 */
export function captureAttribution(input) {
  const source = input instanceof URLSearchParams ? input : new URLSearchParams(String(input || '').replace(/^\?/, ''));
  return Object.fromEntries(CLICK_ID_KEYS.flatMap((key) => {
    const value = bounded(source.get(key));
    return value ? [[key, value]] : [];
  }));
}

function asUrl(input) {
  if (input instanceof URL) return input;
  if (input instanceof URLSearchParams) return new URL(`https://clicktrail.invalid/?${input.toString()}`);
  const raw = String(input || '');
  return new URL(raw.startsWith('?') ? `https://clicktrail.invalid/${raw}` : raw, 'https://clicktrail.invalid/');
}

function touchToFirstTouch(touch) {
  const record = {};
  const fields = {
    source: 'source', medium: 'medium', campaign: 'campaign', term: 'term', content: 'content',
    utmId: 'utm_id', utmSourcePlatform: 'utm_source_platform',
    utmCreativeFormat: 'utm_creative_format', utmMarketingTactic: 'utm_marketing_tactic',
    channelLabel: 'channel', referrer: 'referrer', landingPage: 'landing_page',
    touchTimestamp: 'touch_timestamp',
  };
  for (const [field, suffix] of Object.entries(fields)) {
    const value = bounded(touch[field]);
    if (value) record[`ft_${suffix}`] = value;
  }
  for (const key of CLICK_ID_KEYS) {
    const value = bounded(touch.clickIds?.[key]);
    if (value) {
      record[`ft_${key}`] = value;
      record[key] = value;
    }
  }
  return record;
}

/** Capture a canonical, first-touch record from a URL or URLSearchParams. */
export function captureFirstTouch(input, { now = new Date().toISOString(), referrer = '', currentHost } = {}) {
  let url;
  try { url = asUrl(input); } catch { return {}; }
  const parsed = parseAttributionUrl({
    url: url.toString(),
    now,
    referrer,
    currentHost: currentHost ?? url.host,
  });
  return parsed.kind === 'touch' ? touchToFirstTouch(parsed.touch) : {};
}

/** First-touch merge: the first valid record is write-once. */
export function mergeFirstTouch(existing, incoming) {
  const current = cleanRecord(existing);
  const next = cleanRecord(incoming);
  return hasFirstTouch(current) ? current : next;
}

export function serializeAttributionCookie(value, {
  name = DEFAULT_COOKIE_NAME,
  maxAge = DEFAULT_MAX_AGE,
  domain,
  path = '/',
  sameSite = 'Lax',
  secure = true,
  httpOnly = true,
} = {}) {
  if (!value || typeof value !== 'object') throw new TypeError('attribution must be an object');
  const parts = [`${name}=${encodeURIComponent(JSON.stringify(cleanRecord(value)))}`, `Max-Age=${maxAge}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}

export function parseAttributionCookie(header, name = DEFAULT_COOKIE_NAME) {
  const match = String(header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return {};
  try { return cleanRecord(JSON.parse(decodeURIComponent(match.slice(name.length + 1)))); } catch { return {}; }
}

function requestHeader(request, name) {
  const headers = request?.headers;
  if (typeof headers?.get === 'function') return headers.get(name) || '';
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

function requestBaseUrl(request) {
  const host = requestHeader(request, 'host') || 'clicktrail.invalid';
  const forwardedProto = requestHeader(request, 'x-forwarded-proto').split(',')[0].trim();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  try { return new URL(`${protocol}://${host}/`); } catch { return new URL('https://clicktrail.invalid/'); }
}

function queryUrl(request, base) {
  const query = request?.query;
  if (!query || typeof query !== 'object') return new URL('/', base);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const item = Array.isArray(value) ? value.at(-1) : value;
    if (item !== undefined && item !== null) params.set(key, String(item));
  }
  return new URL(`/?${params.toString()}`, base);
}

function requestUrl(request) {
  const base = requestBaseUrl(request);
  const candidate = request?.nextUrl ?? request?.url;
  if (candidate) {
    try { return candidate instanceof URL ? candidate : new URL(String(candidate), base); } catch { /* fall through to query */ }
  }
  return queryUrl(request, base);
}

export function captureFromNextRequest(request) {
  return captureAttribution(requestUrl(request).searchParams);
}

export function captureFirstTouchFromNextRequest(request, options = {}) {
  const url = requestUrl(request);
  return captureFirstTouch(url, {
    ...options,
    currentHost: options.currentHost ?? url.host,
    referrer: options.referrer ?? requestHeader(request, 'referer'),
  });
}

export function createHiddenFields(attribution) {
  return Object.entries(attribution || {}).filter(([key, value]) => CLICK_ID_KEYS.includes(key) && value).map(([name, value]) => ({ name, value: String(value) }));
}

function requestCookie(request, name) {
  const item = request?.cookies?.get?.(name);
  if (item?.value) return item.value;
  const direct = request?.cookies?.[name];
  if (typeof direct === 'string' && direct) return direct;
  return parseAttributionCookie(requestHeader(request, 'cookie'), name);
}

function hasRequestCookie(request, name) {
  try {
    if (request?.cookies?.get?.(name)) return true;
    if (request?.cookies?.[name] !== undefined) return true;
    return requestHeader(request, 'cookie').split(';').some((part) => part.trim().startsWith(`${name}=`));
  } catch { return false; }
}

export function createMiddleware({ cookieName = DEFAULT_COOKIE_NAME, maxAge, domain, path = '/', sameSite = 'lax', secure = true, httpOnly = true, now, nextResponse, consentGate } = {}) {
  if (!nextResponse || typeof nextResponse.next !== 'function') throw new TypeError('nextResponse with a next() method is required');
  const hasConsent = (request) => {
    try {
      return typeof consentGate === 'function'
        ? consentGate(request) === true
        : request?.consent?.advertising === true;
    } catch { return false; }
  };
  return function clickTrailMiddleware(request) {
    const response = nextResponse.next();
    // NextRequest has no consent property. Unknown consent is denied by default;
    // hosts should inject their CMP decision through consentGate. Clear an
    // existing attribution cookie when consent is denied or withdrawn.
    if (!hasConsent(request)) {
      if (hasRequestCookie(request, cookieName)) {
        response.cookies.set(cookieName, '', {
          httpOnly, secure, sameSite, maxAge: 0, path, ...(domain ? { domain } : {}),
        });
      }
      return response;
    }
    const incoming = captureFirstTouchFromNextRequest(request, now ? { now } : {});
    const previousRaw = requestCookie(request, cookieName);
    const previous = typeof previousRaw === 'string' ? parseAttributionCookie(`${cookieName}=${previousRaw}`, cookieName) : previousRaw;
    const attribution = mergeFirstTouch(previous, incoming);
    if (Object.keys(attribution).length && !hasFirstTouch(previous)) {
      response.cookies.set(cookieName, JSON.stringify(attribution), {
        httpOnly, secure, sameSite, maxAge: maxAge ?? DEFAULT_MAX_AGE, path, ...(domain ? { domain } : {}),
      });
    }
    return response;
  };
}

export async function getAttributionFromCookies(cookieStore, name = DEFAULT_COOKIE_NAME) {
  const item = await cookieStore?.get?.(name);
  if (!item?.value) return {};
  try { return cleanRecord(JSON.parse(item.value)); } catch { return {}; }
}

export function firstTouchForAccount(attribution) {
  const result = {};
  const fields = ['source', 'medium', 'campaign', 'term', 'content', 'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic', 'channel', 'referrer', 'landing_page', 'touch_timestamp'];
  for (const field of fields) {
    const value = bounded(attribution?.[`ft_${field}`]);
    if (value) result[field] = value;
  }
  for (const key of CLICK_ID_KEYS) {
    const value = bounded(attribution?.[`ft_${key}`] ?? attribution?.[key]);
    if (value) result[key] = value;
  }
  return result;
}

/** Build the server-owned account mutation payload; this function does no I/O. */
export async function attachAttributionToAccount(accountId, cookieStore, name = DEFAULT_COOKIE_NAME) {
  if (accountId === undefined || accountId === null || String(accountId) === '') throw new TypeError('accountId is required');
  const attribution = await getAttributionFromCookies(cookieStore, name);
  return { accountId: String(accountId), first_touch: firstTouchForAccount(attribution), attribution };
}

export async function attachAttribution(formData, cookieStore, name = DEFAULT_COOKIE_NAME) {
  const attribution = await getAttributionFromCookies(cookieStore, name);
  return { attribution, formData: formData instanceof FormData ? Object.fromEntries(formData.entries()) : { ...(formData || {}) } };
}
