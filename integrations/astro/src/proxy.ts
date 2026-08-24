/**
 * @vizuh/clicktrail-astro/proxy — first-party proxy API route.
 *
 * Injected by the integration at `/api/clicktrail` (configurable). Forwards
 * validated event batches to the upstream collector. Privacy contract:
 * - visitor IPs are NEVER forwarded (fresh header set; allowlist only)
 * - body size and batch size are bounded
 * - malformed payloads get 4xx, upstream failures get 502
 *
 * Zero `astro` imports: the handler uses the Fetch API shape Astro
 * endpoints already expose.
 */
import { PROXY_CONFIG_GLOBAL, validateProxyConfig } from './config.js';
import type { ClickTrailProxyConfig } from './config.js';

/** Compile-time constant replaced by the integration via Vite define. */
declare const __CLICKTRAIL_PROXY_CONFIG__: string;

export function resolveProxyConfig(raw: string): ClickTrailProxyConfig {
  return validateProxyConfig(JSON.parse(raw) as ClickTrailProxyConfig);
}

interface ForwardResult {
  status: number;
  /** Set on 502 so hosts can log the cause without leaking it to clients. */
  cause?: unknown;
}

export interface ProxyHandler {
  POST: (request: Request) => Promise<Response>;
  GET: (request: Request) => Promise<Response>;
}

export function createProxyHandler(config: ClickTrailProxyConfig, fetchImpl: typeof fetch): ProxyHandler {
  const safeConfig = validateProxyConfig(config);
  return {
    async POST(request: Request): Promise<Response> {
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
        !events.every(
          (e) => {
            if (typeof e !== 'object' || e === null) return false;
            const eventName = (e as Record<string, unknown>).event_name;
            return typeof eventName === 'string' && eventName.trim() !== '';
          },
        )
      ) {
        return new Response(null, { status: 400 });
      }

      const forwardHeaders: Record<string, string> = {};
      for (const name of safeConfig.forwardHeaders) {
        const value = request.headers.get(name);
        if (value !== null) forwardHeaders[name] = value;
      }

      try {
        const upstreamResponse = await fetchImpl(safeConfig.upstream, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...forwardHeaders },
          body: JSON.stringify({ events }),
        });
        if (!upstreamResponse.ok) {
          return new Response(null, { status: 502 });
        }
        return new Response(null, { status: 204 });
      } catch (cause) {
        return new Response(null, { status: 502 });
      }
    },

    async GET(): Promise<Response> {
      return new Response(null, { status: 405 });
    },
  };
}

let cached: ProxyHandler | null = null;

/** Lazy init keeps this module import-safe outside a configured Astro build. */
export function getProxyHandler(): ProxyHandler {
  if (cached === null) {
    cached = createProxyHandler(resolveProxyConfig(__CLICKTRAIL_PROXY_CONFIG__), fetch);
  }
  return cached;
}

export function POST(request: Request): Promise<Response> {
  return getProxyHandler().POST(request);
}

export function GET(request: Request): Promise<Response> {
  return getProxyHandler().GET(request);
}
