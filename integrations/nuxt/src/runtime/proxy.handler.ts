/**
 * @vizuh/clicktrail-nuxt Nitro server handler for the first-party proxy route.
 *
 * Registered by the module via addServerHandler. Uses only Fetch-API +
 * structural shapes — no direct `nitropack`/`h3` imports, so the package
 * builds and tests without Nuxt installed.
 *
 * Upstream resolution order:
 * 1. `globalThis.__CLICKTRAIL_NUXT_PROXY__` (runtime override: { upstream,
 *    forwardHeaders? }) — how `firstPartyProxy: true` gets its collector
 * 2. the baked server runtimeConfig (`clicktrailServer.proxy`) written by
 *    the module at build time
 * No resolvable absolute upstream => 502 (never leaks config errors).
 */
import { createEventHandler } from '../nitro-utils.js';
import { defaultProxyConfig } from '../config.js';
import type { ClickTrailProxyConfig } from '../config.js';
import type { ClickTrailServerRuntimeConfig } from '../types.js';

/** Runtime-upstream override handle settable by hosts/server plugins. */
export interface ClickTrailProxyOverride {
  upstream?: string;
  forwardHeaders?: readonly string[];
}

interface NodeReqLike {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface NitroEventLike {
  node?: { req?: NodeReqLike };
  context?: {
    _nitro?: { runtimeConfig?: { clicktrailServer?: ClickTrailServerRuntimeConfig } };
  };
}

function readBakedProxy(event: NitroEventLike): ClickTrailProxyConfig | null {
  const proxy = event.context?._nitro?.runtimeConfig?.clicktrailServer?.proxy;
  if (!proxy) return null;
  return {
    ...defaultProxyConfig(),
    upstream: proxy.upstream,
    forwardHeaders: proxy.forwardHeaders ?? defaultProxyConfig().forwardHeaders,
  };
}

export function resolveProxyConfig(event: NitroEventLike): ClickTrailProxyConfig | null {
  const override = (globalThis as { __CLICKTRAIL_NUXT_PROXY__?: ClickTrailProxyOverride })
    .__CLICKTRAIL_NUXT_PROXY__;
  const base = readBakedProxy(event);
  const upstream = override?.upstream || base?.upstream || '';
  if (!/^https?:\/\//i.test(upstream)) return null;
  return {
    ...(base ?? defaultProxyConfig()),
    upstream,
    ...(override?.forwardHeaders !== undefined ? { forwardHeaders: override.forwardHeaders } : {}),
  };
}

async function toRequest(event: NitroEventLike): Promise<Request | null> {
  const req = event.node?.req;
  if (!req) return null;
  const url = new URL(req.url ?? '/', 'http://localhost').toString();
  const method = req.method ?? 'POST';
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, value);
    }
  }
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  let body: Uint8Array | undefined;
  if (chunks.length > 0) {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    body = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.byteLength;
    }
  }
  return new Request(url, {
    method,
    headers,
    ...(body !== undefined ? { body: Buffer.from(body).toString('utf8') } : {}),
  });
}

export default async function clicktrailProxyHandler(event: unknown): Promise<Response> {
  const config = resolveProxyConfig(event as NitroEventLike);
  if (config === null) {
    return new Response(null, { status: 502 });
  }
  const request = await toRequest(event as NitroEventLike);
  if (request === null) {
    return new Response(null, { status: 400 });
  }
  return createEventHandler(config, fetch)(request);
}
