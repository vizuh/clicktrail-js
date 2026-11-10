/**
 * Default httpDestination must not strand a partial batch: start() flushes
 * on pagehide / visibilitychange->hidden, and the destination flushes a
 * non-empty batch after maxAgeMs. Consent withdrawal still clears unsent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import { httpDestination } from '../src/browser/transport.js';
import type { Destination } from '../src/browser/transport.js';

function fakeBrowser() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  return {
    win,
    doc,
    pagehide: () => win.dispatchEvent(new Event('pagehide')),
    setVisibility: (state: 'visible' | 'hidden') => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

function eventCount(send: ReturnType<typeof vi.fn>): number {
  return send.mock.calls
    .map((call) => (JSON.parse(call[1] as string) as { events: unknown[] }).events.length)
    .reduce((a, b) => a + b, 0);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('flush on page hide (default httpDestination settings)', () => {
  it('delivers a single tracked event on pagehide', () => {
    const page = fakeBrowser();
    const send = vi.fn();
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send })] });
    ct.start();
    ct.track('page_view');
    expect(send).not.toHaveBeenCalled();

    page.pagehide();
    expect(send).toHaveBeenCalledTimes(1);
    expect(eventCount(send)).toBe(1);
  });

  it('delivers on visibilitychange to hidden, not to visible', () => {
    const page = fakeBrowser();
    const send = vi.fn();
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send })] });
    ct.start();
    ct.track('page_view');

    page.setVisibility('visible');
    expect(send).not.toHaveBeenCalled();
    page.setVisibility('hidden');
    expect(send).toHaveBeenCalledTimes(1);
    expect(eventCount(send)).toBe(1);
  });

  it('removes the listeners on stop()', () => {
    const page = fakeBrowser();
    const flush = vi.fn();
    const dest: Destination = { name: 'spy', deliver: () => {}, flush, clear: () => {} };
    const ct = createClickTrail({ destinations: [dest] });
    ct.start();
    page.pagehide();
    expect(flush).toHaveBeenCalledTimes(1);

    ct.stop();
    expect(flush).toHaveBeenCalledTimes(2); // stop() itself flushes
    page.pagehide();
    page.setVisibility('hidden');
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('registers nothing and still works without window/document', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const send = vi.fn();
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send })] });
    expect(() => ct.start()).not.toThrow();
    ct.track('page_view');
    expect(() => ct.stop()).not.toThrow();
    expect(eventCount(send)).toBe(1);
  });

  it('tolerates a partial document without addEventListener', () => {
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('window', {});
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send: vi.fn() })] });
    expect(() => ct.start()).not.toThrow();
    expect(() => ct.stop()).not.toThrow();
  });

  it('pagehide after consent withdrawal clears without sending', () => {
    const page = fakeBrowser();
    let consent = true;
    const send = vi.fn();
    const ct = createClickTrail({
      destinations: [httpDestination({ endpoint: 'https://t.example', send })],
      consentGate: () => consent,
    });
    ct.start();
    ct.track('page_view');
    consent = false;
    page.pagehide();
    consent = true;
    page.pagehide();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('max-age flush timer', () => {
  it('flushes a single buffered event after the default max age', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send })] });
    ct.start();
    ct.track('page_view');
    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(eventCount(send)).toBe(1);
  });

  it('counts from the oldest buffered event, not the latest', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const dest = httpDestination({ endpoint: 'https://t.example', send, maxAgeMs: 1000 });
    const ct = createClickTrail({ destinations: [dest] });
    ct.start();
    ct.track('a');
    vi.advanceTimersByTime(600);
    ct.track('b');
    vi.advanceTimersByTime(400);
    expect(send).toHaveBeenCalledTimes(1);
    expect(eventCount(send)).toBe(2);
  });

  it('uses the injected schedule seam and arms nothing before the first event', () => {
    const scheduled: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const entry = { fn, ms, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    };
    const send = vi.fn();
    const dest = httpDestination({ endpoint: 'https://t.example', send, maxAgeMs: 250, schedule });
    expect(scheduled).toHaveLength(0);
    dest.deliver({ event_name: 'a' } as never);
    dest.deliver({ event_name: 'b' } as never);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.ms).toBe(250);
    scheduled[0]!.fn();
    expect(eventCount(send)).toBe(2);
  });

  it('maxAgeMs: 0 disables the timer', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const dest = httpDestination({ endpoint: 'https://t.example', send, maxAgeMs: 0 });
    dest.deliver({ event_name: 'a' } as never);
    vi.advanceTimersByTime(60_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('stop() on withdrawal clears and the timer never sends', () => {
    vi.useFakeTimers();
    let consent = true;
    const send = vi.fn();
    const ct = createClickTrail({
      destinations: [httpDestination({ endpoint: 'https://t.example', send })],
      consentGate: () => consent,
    });
    ct.start();
    ct.track('page_view');
    consent = false;
    ct.stop();
    vi.advanceTimersByTime(60_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('clearData() cancels the pending max-age flush', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const ct = createClickTrail({ destinations: [httpDestination({ endpoint: 'https://t.example', send })] });
    ct.start();
    ct.track('page_view');
    ct.clearData();
    vi.advanceTimersByTime(60_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('an explicit flush cancels the timer so the batch is sent once', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const dest = httpDestination({ endpoint: 'https://t.example', send });
    dest.deliver({ event_name: 'a' } as never);
    await dest.flush?.();
    vi.advanceTimersByTime(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
