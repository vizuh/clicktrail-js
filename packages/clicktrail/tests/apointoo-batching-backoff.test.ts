/**
 * Batching + retry with INJECTED jitter and sleep: the backoff schedule is
 * fully deterministic; retry cap surfaces dropped batches via onDropped.
 */
import { describe, expect, it } from 'vitest';
import { createApointooDestination } from '../src/apointoo/destination.js';
import { buildOutcomeEvent } from '../src/apointoo/outcome.js';
import { EVENT_SALE_COMPLETED } from '../src/conventions/stable.js';

function outcome(n: number) {
  return buildOutcomeEvent(EVENT_SALE_COMPLETED, {
    journeyId: `j${n}`,
    value: n,
    currency: 'EUR',
  });
}

function fakeFetch(fails = 0) {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const fetchFn = async (
    _endpoint: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ headers: init.headers, body: init.body });
    return { ok: calls.length > fails, status: calls.length > fails ? 200 : 503 };
  };
  return Object.assign(fetchFn, { calls });
}

describe('createApointooDestination batching', () => {
  it('batches N events then sends once through the injected transport', async () => {
    const fetchFn = fakeFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 3,
      fetch: fetchFn,
      getToken: () => 'tok',
    });
    dest.deliver(outcome(1));
    dest.deliver(outcome(2));
    expect(fetchFn.calls).toHaveLength(0);
    dest.deliver(outcome(3));
    await Promise.resolve(); // let the fire-and-forget flush settle
    expect(fetchFn.calls).toHaveLength(1);
    const body = JSON.parse(fetchFn.calls[0]!.body) as { events: unknown[] };
    expect(body.events).toHaveLength(3);
    expect((body.events[0] as Record<string, unknown>)['journey.id']).toBe('j1');
  });

  it('holds a partial batch until flush()', async () => {
    const fetchFn = fakeFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 5,
      fetch: fetchFn,
    });
    dest.deliver(outcome(1));
    await dest.flush?.();
    expect(fetchFn.calls).toHaveLength(1);
    await dest.flush?.();
    expect(fetchFn.calls).toHaveLength(1); // empty buffer -> no second send
  });
});

describe('retry backoff schedule (injected jitter + sleep)', () => {
  it('follows base * 2^n * (1 + jitter) exactly, deterministically', async () => {
    const fetchFn = fakeFetch(2); // fail twice, succeed on attempt 3
    const delays: number[] = [];
    // Deterministic jitter source: always 0.5 => multiplier (1 + 0.5).
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      maxRetries: 3,
      baseDelayMs: 100,
      jitter: () => 0.5,
      sleep: async (ms) => {
        delays.push(ms);
      },
      fetch: fetchFn,
    });
    dest.deliver(outcome(1));
    await dest.flush?.();

    expect(delays).toEqual([100 * 1.5, 100 * 2 * 1.5]); // attempt 1, 2 backoffs
    expect(fetchFn.calls).toHaveLength(3);
  });

  it('stops retrying after the cap and surfaces the batch via onDropped', async () => {
    const fetchFn = fakeFetch(Number.POSITIVE_INFINITY); // always fails
    const dropped: unknown[] = [];
    const delays: number[] = [];
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      maxRetries: 2,
      baseDelayMs: 10,
      jitter: () => 0.25,
      sleep: async (ms) => {
        delays.push(ms);
      },
      fetch: fetchFn,
      onDropped: (d) => dropped.push(d),
    });
    dest.deliver(outcome(1));
    dest.deliver(outcome(2));
    await dest.flush?.();

    expect(delays).toEqual([10 * 1.25, 10 * 2 * 1.25]);
    expect(fetchFn.calls).toHaveLength(3); // initial + 2 retries
    expect(dropped).toHaveLength(1);
    const d = dropped[0] as { events: Record<string, unknown>[]; attempts: number };
    expect(d.events).toHaveLength(2);
    expect(d.attempts).toBe(3);
    // DROPPED-BATCH LAW: the events are recoverable, not silently lost.
    expect((d.events[0] as Record<string, unknown>)['journey.id']).toBe('j1');
  });
});
