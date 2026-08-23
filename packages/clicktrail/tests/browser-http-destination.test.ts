/**
 * httpDestination: batching + flush through an INJECTED sender.
 * No network, no navigator access in unit tests.
 */
import { describe, expect, it, vi } from 'vitest';
import { httpDestination, type SendFn } from '../src/browser/transport.js';
import { buildEventPayload } from '../src/browser/serialize.js';

function event(n: number) {
  return buildEventPayload({ ft_source: 'google' }, 'page_view', { n });
}

function fakeSend(): SendFn & { calls: { endpoint: string; body: string }[] } {
  const calls: { endpoint: string; body: string }[] = [];
  const send = ((endpoint: string, body: string) => {
    calls.push({ endpoint, body });
  }) as SendFn & { calls: typeof calls };
  send.calls = calls;
  return send;
}

describe('httpDestination', () => {
  it('batches N events then flushes once via the injected sender', () => {
    const send = fakeSend();
    const dest = httpDestination({ endpoint: 'https://t.example/collect', batchSize: 3, send });

    dest.deliver(event(1));
    dest.deliver(event(2));
    expect(send.calls).toHaveLength(0);

    dest.deliver(event(3));
    expect(send.calls).toHaveLength(1);
    expect(send.calls[0]!.endpoint).toBe('https://t.example/collect');

    const body = JSON.parse(send.calls[0]!.body) as { events: Record<string, unknown>[] };
    expect(body.events).toHaveLength(3);
    expect(body.events.map((e) => e['n'])).toEqual([1, 2, 3]);
    for (const e of body.events) {
      expect(e['schema_version']).toBeTypeOf('string');
      expect(e['classifier_version']).toBeTypeOf('string');
    }
  });

  it('holds a partial batch until flush() is called', async () => {
    const send = fakeSend();
    const dest = httpDestination({ endpoint: 'https://t.example/collect', batchSize: 5, send });

    dest.deliver(event(1));
    dest.deliver(event(2));
    await dest.flush?.();

    expect(send.calls).toHaveLength(1);
    const body = JSON.parse(send.calls[0]!.body) as { events: unknown[] };
    expect(body.events).toHaveLength(2);

    // Buffer resets: next batch starts empty.
    await dest.flush?.();
    expect(send.calls).toHaveLength(1);
  });

  it('flush() with nothing buffered sends nothing', async () => {
    const send = fakeSend();
    const dest = httpDestination({ endpoint: 'https://t.example/collect', send });
    await dest.flush?.();
    expect(send.calls).toHaveLength(0);
  });
});
