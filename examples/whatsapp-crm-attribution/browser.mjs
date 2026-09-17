// Browser-side helper. The endpoint reads the ClickTrail cookie server-side.
import { extractHandoffCode, whatsappUrl } from './whatsapp-link.mjs';

const allowsHandoff = (consentState) => Boolean(
  consentState && (consentState.marketing === true || consentState.advertising === true),
);

function validEndpoint(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    const origin = globalThis.location?.origin;
    return Boolean(origin)
      && (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === origin;
  } catch {
    return false;
  }
}

function validResponse(body) {
  return body && body.status === 'created'
    && typeof body.handoff?.id === 'string'
    && typeof body.handoff?.code === 'string'
    && extractHandoffCode(body.handoff.code) === body.handoff.code;
}

/**
 * Request one opaque handoff code from an application-owned endpoint.
 *
 * The request intentionally contains no attribution payload. The endpoint
 * should read the consent-gated ClickTrail cookie with the server adapter and
 * create the immutable snapshot there.
 */
export async function requestWhatsAppHandoff({
  endpoint = '/api/whatsapp-handoff',
  consentState,
  clicktrail,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!allowsHandoff(consentState)) {
    return { status: 'not_created', reason: 'consent_required' };
  }
  if (clicktrail !== undefined && typeof clicktrail?.isStarted === 'function' && !clicktrail.isStarted()) {
    return { status: 'not_created', reason: 'clicktrail_not_started' };
  }
  if (!validEndpoint(endpoint)) {
    return { status: 'not_created', reason: 'invalid_endpoint' };
  }
  if (typeof fetchImpl !== 'function') {
    return { status: 'not_created', reason: 'fetch_unavailable' };
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destination: 'whatsapp' }),
      redirect: 'error',
    });
    if (!response?.ok) return { status: 'not_created', reason: 'handoff_endpoint_failed' };
    const body = await response.json();
    if (!validResponse(body)) return { status: 'not_created', reason: 'handoff_response_invalid' };
    return { status: 'created', handoff: body.handoff };
  } catch {
    return { status: 'not_created', reason: 'handoff_endpoint_unavailable' };
  }
}

/**
 * Build a WhatsApp URL after requesting a code. When consent or the endpoint
 * is unavailable, this returns a direct link without an attribution code.
 */
export async function createWhatsAppLink({
  phone,
  message,
  endpoint,
  consentState,
  clicktrail,
  fetchImpl,
} = {}) {
  const result = await requestWhatsAppHandoff({ endpoint, consentState, clicktrail, fetchImpl });
  const code = result.status === 'created' ? result.handoff.code : undefined;
  return {
    ...result,
    url: whatsappUrl({ phone, message, handoffCode: code }),
  };
}
