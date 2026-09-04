import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDeliveryTimeout } from '@vizuh/clicktrail-browser';
import { ClickTrailServer } from '../src/server.js';
import { ClickTrailServer as AstroServer } from '../../../integrations/astro/src/server.js';
import { ClickTrailServer as NuxtServer } from '../../../integrations/nuxt/src/server.js';
import { ClickTrailServer as QwikServer } from '../../../integrations/qwik/src/server.js';
import { trackConversion } from '../../../integrations/sveltekit/src/server-events.js';
import { createProxyHandler as astroProxy } from '../../../integrations/astro/src/proxy.js';
import { createProxyHandler as sveltekitProxy } from '../../../integrations/sveltekit/src/proxy.js';
import { createEventHandler as nuxtProxy } from '../../../integrations/nuxt/src/nitro-utils.js';
import { defaultProxyConfig } from '../../../integrations/astro/src/config.js';
import { sendEvents } from '../../../integrations/typebot/src/send.js';
import { resolveTypebotBlockConfig } from '../../../integrations/typebot/src/config.js';
import { createSendEventHandler } from '../../../integrations/directus/src/api/operation.js';
import { createClickTrailHook } from '../../../integrations/directus/src/api/hook.js';

const endpoint = 'https://collector.example/events';
const identity = { payload: {} };
const batch = { events: [{ event_name: 'lead_created' }] };
const request = () => new Request('https://site.example/api/clicktrail', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch),
});
const proxyConfig = defaultProxyConfig({ upstream: endpoint });
const senders: Array<[string, (fetchImpl: typeof fetch) => Promise<unknown>, unknown]> = [
  ...[ClickTrailServer, AstroServer, NuxtServer, QwikServer].map((Server, index): [string, (fetchImpl: typeof fetch) => Promise<unknown>, unknown] => [
    ['canonical', 'astro', 'nuxt', 'qwik'][index]!,
    (fetchImpl) => new Server({ endpoint, fetch: fetchImpl }).trackLead({ identity }),
    { ok: false, status: 0 },
  ]),
  ['sveltekit', (fetchImpl) => trackConversion({ headers: { get: () => null } }, { endpoint, event: 'lead', fetch: fetchImpl }), { ok: false, status: 0 }],
  ['astro proxy', async (fetchImpl) => (await astroProxy(proxyConfig, fetchImpl).POST(request())).status, 502],
  ['nuxt proxy', async (fetchImpl) => (await nuxtProxy(proxyConfig, fetchImpl)(request())).status, 502],
  ['sveltekit proxy', async (fetchImpl) => (await sveltekitProxy(proxyConfig, fetchImpl).POST(request())).status, 502],
  ['typebot', (fetchImpl) => sendEvents([{ schema_version: 1, event_name: 'lead_created', occurred_at: '2026-09-04T00:00:00Z' }], resolveTypebotBlockConfig({ endpoint }), fetchImpl), { ok: false, error: 'TimeoutError' }],
  ['directus operation', (fetchImpl) => createSendEventHandler({ fetchImpl })({ endpoint, eventName: 'lead_created' }), expect.objectContaining({ ok: false, status: 0 })],
  ['directus hook', async (fetchImpl) => {
    let handler: ((payload: Record<string, unknown>, meta: { collection: string }) => unknown) | undefined;
    createClickTrailHook({ fetchImpl, env: { CLICKTRAIL_ENDPOINT: endpoint } })({
      filter: (_event, callback) => { handler = callback; },
    });
    return handler!({ id: 'lead1' }, { collection: 'leads' });
  }, { id: 'lead1' }],
];

describe('server delivery deadline', () => {
  afterEach(() => vi.useRealTimers());

  it.each(senders)('%s returns and aborts after 3 seconds even when fetch ignores abort', async (_name, send, expected) => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: unknown, _init?: RequestInit) => new Promise<Response>(() => {}));
    const result = send(fetchImpl as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const signal = fetchImpl.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual(expected);
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an abort-aware sender and clears the deadline on success or rejection', async () => {
    vi.useFakeTimers();
    let aborts = 0;
    const timeout = withDeliveryTimeout((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborts++; reject(signal.reason); });
    }));
    const rejected = expect(timeout).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(aborts).toBe(1);
    await expect(withDeliveryTimeout(async () => 42)).resolves.toBe(42);
    await expect(withDeliveryTimeout(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });
});
