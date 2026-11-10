import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickTrailServer, type ClickTrailServerConfig } from '../src/server.js';

const UUID_EVENT_ID = /^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function harness(extra: Partial<ClickTrailServerConfig> = {}) {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  const server = new ClickTrailServer({
    endpoint: 'https://collector.example.com/v1/events',
    siteId: 's1',
    fetch: fetchMock as unknown as typeof fetch,
    ...extra,
  });
  const ids = () => fetchMock.mock.calls.map((call) => {
    const [, init] = call as unknown as [string, RequestInit];
    const event = (JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(event['marketing_trail']).toMatchObject({ event_id: event['event_id'] });
    return event['event_id'] as string;
  });
  return { server, ids };
}

/** Deterministic byte source: call n fills every byte with n. */
function counterBytes() {
  let call = 0;
  return vi.fn((length: number) => new Uint8Array(length).fill(++call));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClickTrailServer event_id without a business key', () => {
  it('gives distinct ids to two id-less leads that share only a formId', async () => {
    const { server, ids } = harness();
    await server.trackLead({ identity: { payload: {} }, data: { formId: 'contact' } });
    await server.trackLead({ identity: { payload: {} }, data: { formId: 'contact' } });
    const [first, second] = ids();
    expect(first).toMatch(UUID_EVENT_ID);
    expect(second).toMatch(UUID_EVENT_ID);
    expect(first).not.toBe(second);
  });

  it('gives distinct ids to bare leads with no data at all', async () => {
    const { server, ids } = harness();
    await server.trackLead({ identity: { payload: {} } });
    await server.trackLead({ identity: { payload: {} } });
    const [first, second] = ids();
    expect(first).not.toBe(second);
  });

  it('does not derive an id from formId plus visitor/session identity alone', async () => {
    const { server, ids } = harness();
    const identity = { payload: {}, visitorId: 'v-1', sessionId: 's-1' };
    await server.trackLead({ identity, data: { formId: 'contact' } });
    await server.trackLead({ identity, data: { formId: 'contact' } });
    await server.trackBooking({ identity });
    await server.trackBooking({ identity });
    const [lead1, lead2, booking1, booking2] = ids();
    expect(lead1).not.toBe(lead2);
    expect(booking1).not.toBe(booking2);
  });

  it('treats empty business keys as absent', async () => {
    const { server, ids } = harness();
    await server.trackLead({ identity: { payload: {} }, data: { leadId: '', lead_id: ' ' } });
    await server.trackLead({ identity: { payload: {} }, data: { leadId: '', lead_id: ' ' } });
    const [first, second] = ids();
    expect(first).not.toBe(second);
  });

  it('mints from the injected randomBytes source', async () => {
    const randomBytes = counterBytes();
    const { server, ids } = harness({ randomBytes });
    await server.trackLead({ identity: { payload: {} }, data: { formId: 'contact' } });
    await server.trackLead({ identity: { payload: {} }, data: { formId: 'contact' } });
    expect(randomBytes).toHaveBeenCalledTimes(2);
    expect(randomBytes).toHaveBeenCalledWith(16);
    expect(ids()).toEqual([
      'evt_01010101-0101-4101-8101-010101010101',
      'evt_02020202-0202-4202-8202-020202020202',
    ]);
  });

  it('falls back to node:crypto when no global WebCrypto exists (Node 18)', async () => {
    vi.stubGlobal('crypto', undefined);
    expect((globalThis as { crypto?: Crypto }).crypto).toBeUndefined();
    const { server, ids } = harness();
    await server.trackLead({ identity: { payload: {} } });
    await server.trackLead({ identity: { payload: {} } });
    const [first, second] = ids();
    expect(first).toMatch(UUID_EVENT_ID);
    expect(second).toMatch(UUID_EVENT_ID);
    expect(first).not.toBe(second);
  });

  it('does not delay delivery when loaded without a global WebCrypto (Node 18)', async () => {
    vi.resetModules();
    vi.stubGlobal('crypto', undefined);
    const { ClickTrailServer: FreshServer } = await import('../src/server.js');
    // Module load and the first track* call are separate turns in real hosts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: unknown, _init?: RequestInit) => new Promise<Response>(() => {}));
      const result = new FreshServer({ endpoint: 'https://collector.example.com/v1/events', fetch: fetchImpl as typeof fetch })
        .trackLead({ identity: { payload: {} } });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledOnce();
      const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)) as { events: Array<Record<string, unknown>> };
      expect(body.events[0]!['event_id']).toMatch(UUID_EVENT_ID);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(result).resolves.toEqual({ ok: false, status: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ClickTrailServer event_id with a business key', () => {
  it('ignores an empty business key that sits ahead of a real one', async () => {
    const randomBytes = counterBytes();
    const { server, ids } = harness({ randomBytes });
    await server.trackLead({ identity: { payload: {} }, data: { transactionId: '', leadId: 'L1' } });
    await server.trackLead({ identity: { payload: {} }, data: { transactionId: '', leadId: 'L2' } });
    await server.trackLead({ identity: { payload: {} }, data: { transactionId: ' ', leadId: 'L3' } });
    await server.trackLead({ identity: { payload: {} }, data: { transactionId: ' ', leadId: 'L4' } });
    await server.trackLead({ identity: { payload: {} }, data: { transactionId: '', leadId: 'L1' } });
    const [l1, l2, l3, l4, l1b] = ids();
    expect(randomBytes).not.toHaveBeenCalled();
    expect(new Set([l1, l2, l3, l4]).size).toBe(4);
    expect(l1b).toBe(l1);
  });

  it('derives the same id for the same leadId, bookingId, or orderId across calls', async () => {
    const randomBytes = counterBytes();
    const { server, ids } = harness({ randomBytes });
    const identity = { payload: {}, visitorId: 'v-1', sessionId: 's-1' };
    await server.trackLead({ identity, data: { leadId: 'lead-1' } });
    await server.trackLead({ identity, data: { leadId: 'lead-1' } });
    await server.trackBooking({ identity, data: { bookingId: 'bk-1' } });
    await server.trackBooking({ identity, data: { bookingId: 'bk-1' } });
    await server.trackLead({ identity, data: { orderId: 'ord-1' } });
    await server.trackLead({ identity, data: { orderId: 'ord-1' } });
    await server.trackLead({ identity, data: { orderId: 'ord-2' } });
    await server.trackPurchase({ identity, data: { transactionId: 'tx-1', value: 10, currency: 'EUR' } });
    await server.trackPurchase({ identity, data: { transactionId: 'tx-1', value: 10, currency: 'EUR' } });
    const [lead1, lead2, bk1, bk2, ord1, ord1b, ord2, tx1, tx1b] = ids();
    expect(randomBytes).not.toHaveBeenCalled();
    for (const id of [lead1, bk1, ord1, ord2, tx1]) expect(id).toMatch(/^evt_s-[0-9a-f]{32}$/);
    expect(lead2).toBe(lead1);
    expect(bk2).toBe(bk1);
    expect(ord1b).toBe(ord1);
    expect(ord2).not.toBe(ord1);
    expect(tx1b).toBe(tx1);
  });

  it('derives a stable id when the caller pins the occurrence time with now', async () => {
    const randomBytes = counterBytes();
    const { server, ids } = harness({ randomBytes });
    const input = { identity: { payload: {} }, data: { formId: 'contact' }, now: '2026-09-20T09:00:00.000Z' };
    await server.trackLead(input);
    await server.trackLead(input);
    await server.trackLead({ ...input, now: '2026-09-20T09:00:01.000Z' });
    const [first, second, third] = ids();
    expect(randomBytes).not.toHaveBeenCalled();
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('lets an explicit eventId win over business keys and randomness', async () => {
    const randomBytes = counterBytes();
    const { server, ids } = harness({ randomBytes });
    await server.trackLead({ identity: { payload: {} }, eventId: 'crm-1', data: { leadId: 'lead-1' } });
    await server.trackLead({ identity: { payload: {} }, eventId: 'crm-1' });
    expect(ids()).toEqual(['evt_crm-1', 'evt_crm-1']);
    expect(randomBytes).not.toHaveBeenCalled();
  });
});
