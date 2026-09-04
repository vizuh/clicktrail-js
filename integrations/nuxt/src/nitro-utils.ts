/**
 * @vizuh/clicktrail-nuxt/nitro — Nitro server utilities.
 *
 * Re-export pattern over locally-owned logic (no cross-package imports):
 * identity parsing re-exports ./server.js; createEventHandler duplicates
 * the Astro proxy's exact validation/forwarding matrix with a single
 * callable handler shape matching Nitro's Request-in/Response-out surface.
 *
 * Privacy contract:
 * - visitor IPs are NEVER forwarded (fresh header set; allowlist only)
 * - body size and batch size are bounded
 * - malformed payloads get 4xx, upstream failures get 502
 */
import { withDeliveryTimeout } from '@vizuh/clicktrail/browser';
import { validateProxyConfig } from './config.js';
import type { NitroEventHandler } from './types.js';
import type { ClickTrailProxyConfig } from './config.js';

export { parseIdentityFromCookies } from './server.js';
export type { ServerIdentity, SendResult, ClickTrailServerConfig } from './server.js';
export { ClickTrailServer } from './server.js';

/**
 * Build a Nitro-compatible event handler for the first-party proxy route.
 * Returns `(request: Request) => Promise<Response>` — structurally an H3
 * event handler on Nitro's modern fetch surface.
 */
export function createEventHandler(
  config: ClickTrailProxyConfig,
  fetchImpl: typeof fetch,
): NitroEventHandler {
  const safeConfig = validateProxyConfig(config);
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return new Response(null, { status: 415 });
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > safeConfig.maxBodyBytes) {
      return new Response(null, { status: 413 });
    }

    let text: string;
    try {
      text = await request.text();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (text.length > safeConfig.maxBodyBytes) {
      return new Response(null, { status: 413 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }

    const events = (parsed as { events?: unknown }).events;
    if (
      !Array.isArray(events) ||
      events.length === 0 ||
      events.length > safeConfig.maxBatchEvents ||
      !events.every((e) => {
        if (typeof e !== 'object' || e === null) return false;
        const eventName = (e as Record<string, unknown>).event_name;
        return typeof eventName === 'string' && eventName.trim() !== '';
      })
    ) {
      return new Response(null, { status: 400 });
    }

    const forwardHeaders: Record<string, string> = {};
    for (const name of safeConfig.forwardHeaders) {
      const value = request.headers.get(name);
      if (value !== null) forwardHeaders[name] = value;
    }

    try {
      const upstreamResponse = await withDeliveryTimeout((signal) => fetchImpl(safeConfig.upstream, {
        signal,
        method: 'POST',
        headers: { 'content-type': 'application/json', ...forwardHeaders },
        body: JSON.stringify({ events }),
        redirect: 'error',
      }));
      if (!upstreamResponse.ok) {
        return new Response(null, { status: 502 });
      }
      return new Response(null, { status: 204 });
    } catch {
      return new Response(null, { status: 502 });
    }
  };
}
