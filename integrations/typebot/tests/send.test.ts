import { describe, expect, it, vi } from 'vitest';
import { resolveTypebotBlockConfig } from '../src/config.js';
import { CLICKTRAIL_KEY_HEADER, sendEvents, type FetchLikeResponse } from '../src/send.js';
import type { BlockEvent } from '../src/events.js';

const event: BlockEvent = {
  schema_version: 1,
  event_name: 'lead_created',
  occurred_at: '2026-08-24T10:00:00.000Z',
};

function okFetch(status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async (): Promise<FetchLikeResponse> => ({ ok: status >= 200 && status < 300, status }));
}

describe('sendEvents', () => {
  it('POSTs a JSON batch body to the endpoint with content-type header', async () => {
    const fetchImpl = okFetch();
    const config = resolveTypebotBlockConfig({ endpoint: '/api/clicktrail' });
    const result = await sendEvents([event], config, fetchImpl as never);
    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/clicktrail');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ events: [event] });
  });

  it('sends X-ClickTrail-Key only when an apiKey is configured', async () => {
    const withKey = okFetch();
    await sendEvents(
      [event],
      resolveTypebotBlockConfig({ endpoint: '/api/clicktrail', apiKey: 'k-123' }),
      withKey as never,
    );
    const headers = new Headers((withKey.mock.calls[0] as [string, RequestInit])[1].headers);
    expect(headers.get(CLICKTRAIL_KEY_HEADER)).toBe('k-123');

    const withoutKey = okFetch();
    await sendEvents(
      [event],
      resolveTypebotBlockConfig({ endpoint: '/api/clicktrail' }),
      withoutKey as never,
    );
    const bare = new Headers((withoutKey.mock.calls[0] as [string, RequestInit])[1].headers);
    expect(bare.get(CLICKTRAIL_KEY_HEADER)).toBeNull();
  });

  it('reports non-2xx responses as { ok: false } with the status', async () => {
    const result = await sendEvents(
      [event],
      resolveTypebotBlockConfig({ endpoint: 'https://x.example.com/e' }),
      okFetch(503) as never,
    );
    expect(result).toEqual({ ok: false, status: 503 });
  });

  it('NEVER throws: network rejection resolves { ok: false }', async () => {
    const failing = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const result = await sendEvents(
      [event],
      resolveTypebotBlockConfig({ endpoint: 'https://x.example.com/e' }),
      failing as never,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBeUndefined();
  });

  it('never throws when the injected fetch rejects with a non-Error value', async () => {
    const failing = vi.fn(async () => {
      throw 'boom';
    });
    const result = await sendEvents(
      [event],
      resolveTypebotBlockConfig({ endpoint: '/e' }),
      failing as never,
    );
    expect(result.ok).toBe(false);
  });

  it('skips the network for empty batches', async () => {
    const fetchImpl = okFetch();
    const result = await sendEvents([], resolveTypebotBlockConfig({}), fetchImpl as never);
    expect(result.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('never-throws guarantee through the block factory', () => {
  it('a failed analytics send still resolves; validation rejections are promise rejections', async () => {
    const { ClickTrailBlock } = await import('../src/index.js');
    const block = new ClickTrailBlock(
      { endpoint: '/api/clicktrail' },
      {
        now: () => new Date('2026-08-24T10:00:00.000Z'),
        fetchImpl: (async () => {
          throw new Error('down');
        }) as never,
      },
    );

    // Analytics is down -> resolved failure, chat flow continues.
    await expect(block.identifyVisitor({ Email: 'x@example.com' })).resolves.toMatchObject({
      ok: false,
    });

    // Validation errors reject as promises with '<action>.<field>' wording.
    await expect(block.trackQualifiedLead({})).rejects.toThrow(/lead_qualified\.lead_id/);
    await expect(
      block.trackPurchase({ transactionId: 'tx_1', value: 100 }),
    ).rejects.toThrow(/sale\.currency/);
  });
});
