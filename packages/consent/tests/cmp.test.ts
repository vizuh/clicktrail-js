import { describe, expect, it } from 'vitest';
import { connectComplianz, connectCookiebot, connectOneTrust } from '../src/cmp/index.js';
import type { CmpTarget } from '../src/cmp/index.js';
import { storageAllowed } from '../src/gates.js';
import { createConsentHub } from '../src/listener.js';
import type { ConsentRecord } from '../src/types.js';

const at = () => new Date('2026-09-29T00:00:00.000Z');

function fakeTarget(extra: Record<string, unknown> = {}): CmpTarget & { fire(type: string, detail?: unknown): void } {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    ...extra,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    fire(type, detail) {
      listeners.get(type)?.forEach((fn) => fn({ type, detail }));
    },
  };
}

function collect() {
  const hub = createConsentHub();
  const seen: ConsentRecord[] = [];
  hub.subscribe((record) => seen.push(record));
  return { hub, seen };
}

// Mirrors a host that captures attribution only on an emitted grant, reading the
// click ID from the URL, while the CMP may already have wiped storage.
function hostWithStorage(hub: ReturnType<typeof createConsentHub>, url: string) {
  const storage = new Map<string, string>();
  hub.subscribe((record) => {
    if (storageAllowed(() => record)) {
      storage.set('attribution', new URL(url).searchParams.get('gclid') ?? '');
    } else {
      storage.clear();
    }
  });
  return storage;
}

describe('connectCookiebot', () => {
  it('captures the landing click after a wipe-then-accept', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ Cookiebot: { hasResponse: false, consent: { marketing: false, statistics: false } } });
    const storage = hostWithStorage(hub, 'https://example.test/?gclid=G1');
    connectCookiebot(hub, { target, now: at });
    expect(seen).toEqual([]); // pending never emits

    storage.clear(); // Cookiebot wipes unclassified storage first
    target.Cookiebot = { hasResponse: true, consent: { marketing: true, statistics: true } };
    target.fire('CookiebotOnConsentReady');
    target.fire('CookiebotOnAccept');

    expect(seen).toEqual([
      { state: 'granted', marketing: true, advertising: true, analytics: true, source: 'cookiebot', at: at().toISOString() },
    ]);
    expect(storage.get('attribution')).toBe('G1');
  });

  it('emits denied on decline and persists nothing', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ Cookiebot: { hasResponse: false } });
    const storage = hostWithStorage(hub, 'https://example.test/?gclid=G1');
    connectCookiebot(hub, { target, now: at });
    target.Cookiebot = { hasResponse: true, consent: { marketing: false, statistics: false } };
    target.fire('CookiebotOnDecline');
    expect(seen.map((record) => record.state)).toEqual(['denied']);
    expect(storage.size).toBe(0);
  });

  it('reads an existing response at connect and observes a later in-page withdrawal', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ Cookiebot: { hasResponse: true, consent: { marketing: true, statistics: false } } });
    const storage = hostWithStorage(hub, 'https://example.test/?gclid=G1');
    connectCookiebot(hub, { target, now: at });
    expect(seen.map((record) => record.state)).toEqual(['granted']);

    target.Cookiebot = { hasResponse: true, consent: { marketing: false, statistics: false } };
    target.fire('CookiebotOnDecline');
    expect(seen.map((record) => record.state)).toEqual(['granted', 'denied']);
    expect(storage.size).toBe(0);
  });

  it('analytics-only consent does not unlock storage', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ Cookiebot: { hasResponse: true, consent: { marketing: false, statistics: true } } });
    connectCookiebot(hub, { target, now: at });
    expect(seen[0]).toMatchObject({ state: 'denied', analytics: true, marketing: false });
  });

  it('dispose stops delivery', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ Cookiebot: { hasResponse: false } });
    const dispose = connectCookiebot(hub, { target, now: at });
    dispose();
    target.Cookiebot = { hasResponse: true, consent: { marketing: true } };
    target.fire('CookiebotOnAccept');
    expect(seen).toEqual([]);
  });
});

describe('connectOneTrust', () => {
  it('maps exact groups, keeps the host wrapper, and observes changes', () => {
    const { hub, seen } = collect();
    const calls: string[] = [];
    const hostWrapper = () => calls.push('host');
    const target = fakeTarget({ OptanonWrapper: hostWrapper });
    const dispose = connectOneTrust(hub, { target, now: at });
    expect(seen).toEqual([]); // groups not loaded yet

    target.OnetrustActiveGroups = ',C0001,C0002,C0004,';
    (target.OptanonWrapper as () => void)();
    target.OnetrustActiveGroups = ',C0001,C00040,';
    (target.OptanonWrapper as () => void)();

    expect(calls).toEqual(['host', 'host']);
    expect(seen.map((record) => [record.state, record.analytics])).toEqual([
      ['granted', true],
      ['denied', false],
    ]);
    dispose();
    expect(target.OptanonWrapper).toBe(hostWrapper);
  });

  it('still hears changes after the install snippet replaces OptanonWrapper', () => {
    const { hub, seen } = collect();
    const target = fakeTarget();
    connectOneTrust(hub, { target, now: at });
    target.OptanonWrapper = function OptanonWrapper() {}; // snippet loaded after us
    target.OnetrustActiveGroups = ',C0001,C0004,';
    target.fire('OneTrustGroupsUpdated');
    expect(seen.map((record) => record.state)).toEqual(['granted']);
  });

  it('dispose stops delivery even when another wrapper sits on top', () => {
    const { hub, seen } = collect();
    const target = fakeTarget();
    const dispose = connectOneTrust(hub, { target, now: at });
    const ours = target.OptanonWrapper as () => void;
    target.OptanonWrapper = () => ours(); // someone wraps us
    dispose();
    target.OnetrustActiveGroups = ',C0004,';
    (target.OptanonWrapper as () => void)();
    target.fire('OneTrustGroupsUpdated');
    expect(seen).toEqual([]);
  });

  it('supports custom group ids', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ OnetrustActiveGroups: ',C0001,TARGET,' });
    connectOneTrust(hub, { target, now: at, marketingGroup: 'TARGET' });
    expect(seen[0]?.state).toBe('granted');
  });
});

describe('connectComplianz', () => {
  it('reads accepted categories from event.detail.categories', () => {
    const { hub, seen } = collect();
    const target = fakeTarget();
    connectComplianz(hub, { target, now: at });
    expect(seen).toEqual([]);
    target.fire('cmplz_fire_categories', { categories: ['functional', 'statistics', 'marketing'] });
    expect(seen[0]).toMatchObject({ state: 'granted', analytics: true, source: 'complianz' });
  });

  it('prefers cmplz_has_consent and observes a withdrawal via cmplz_status_change', () => {
    const { hub, seen } = collect();
    let marketing = true;
    const target = fakeTarget({
      cmplz_has_consent: (category: string) => (category === 'marketing' ? marketing : false),
      cmplz_get_banner_status: () => 'dismissed',
    });
    connectComplianz(hub, { target, now: at });
    expect(seen.map((record) => record.state)).toEqual(['granted']); // stored decision at connect
    marketing = false;
    target.fire('cmplz_status_change', {});
    expect(seen.map((record) => record.state)).toEqual(['granted', 'denied']);
  });

  it('does not emit at connect while the banner is still open', () => {
    const { hub, seen } = collect();
    const target = fakeTarget({ cmplz_has_consent: () => false, cmplz_get_banner_status: () => 'show' });
    connectComplianz(hub, { target, now: at });
    expect(seen).toEqual([]);
  });
});

describe('import safety', () => {
  it('connectors are no-ops without a window', () => {
    const { hub, seen } = collect();
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    connectCookiebot(hub)();
    connectOneTrust(hub)();
    connectComplianz(hub)();
    expect(seen).toEqual([]);
  });
});
