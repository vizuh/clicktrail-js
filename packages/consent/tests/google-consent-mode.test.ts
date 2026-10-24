import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { toRecord } from '../src/cmp/shared.js';
import {
  applyConsentModeUpdate,
  consentModeDefaultScript,
  consentModeSignals,
  loadConsentRecord,
  saveConsentRecord,
} from '../src/google-consent-mode.js';
import type { ConsentModeSignals, ConsentStorage, GtagTarget } from '../src/google-consent-mode.js';
import { createConsentHub } from '../src/listener.js';
import type { ConsentRecord } from '../src/types.js';

const KEY = 'site:consent';
const at = () => new Date('2026-10-23T00:00:00.000Z');

const DENIED: ConsentModeSignals = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};
const ANALYTICS_ONLY: ConsentModeSignals = { ...DENIED, analytics_storage: 'granted' };
const ALL_GRANTED: ConsentModeSignals = {
  analytics_storage: 'granted',
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
};

// Same shapes the CMP adapters emit.
const analyticsOnly = toRecord({ marketing: false, analytics: true }, 'test', at);
const analyticsAndAds = toRecord({ marketing: true, analytics: true }, 'test', at);
const denied = toRecord({ marketing: false, analytics: false }, 'test', at);

function memoryStorage(initial: Record<string, string> = {}): ConsentStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Run the inline script in a fresh context; return what it pushed to the dataLayer. */
function runDefaultScript(script: string, stored: string | null | 'throws'): unknown[][] {
  const localStorage = {
    getItem(key: string) {
      if (stored === 'throws') throw new Error('SecurityError');
      return key === KEY ? stored : null;
    },
  };
  const window: { localStorage: typeof localStorage; dataLayer?: unknown[] } = { localStorage };
  runInNewContext(script, { window });
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

describe('consentModeSignals', () => {
  it('pending and denied both map to all denied', () => {
    expect(consentModeSignals(null)).toEqual(DENIED);
    expect(consentModeSignals(undefined)).toEqual(DENIED);
    expect(consentModeSignals(denied)).toEqual(DENIED);
  });

  it('analytics-only grants analytics_storage even though state follows marketing', () => {
    expect(analyticsOnly.state).toBe('denied');
    expect(consentModeSignals(analyticsOnly)).toEqual(ANALYTICS_ONLY);
  });

  it('analytics + advertising grants every signal', () => {
    expect(consentModeSignals(analyticsAndAds)).toEqual(ALL_GRANTED);
  });

  it('advertising falls back to marketing only when unset; absent flags are denied', () => {
    expect(consentModeSignals({ state: 'granted', marketing: true }).ad_storage).toBe('granted');
    expect(consentModeSignals({ state: 'granted', advertising: false, marketing: true }).ad_storage).toBe('denied');
    expect(consentModeSignals({ state: 'granted' })).toEqual(DENIED);
  });
});

describe('consentModeDefaultScript', () => {
  const script = consentModeDefaultScript({ storageKey: KEY });

  it('defines dataLayer and gtag, then issues a consent default', () => {
    expect(script).toContain('w.dataLayer=w.dataLayer||[]');
    expect(script).toContain('w.gtag=w.gtag||function(){w.dataLayer.push(arguments);}');
    expect(script).toContain("w.gtag('consent','default',");
    expect(script).toContain('wait_for_update:500');
  });

  it('pending (nothing stored), unreadable storage and corrupt JSON default to denied', () => {
    for (const stored of [null, 'throws', '{not json', '"granted"', '{"state":"maybe","analytics":true}'] as const) {
      expect(runDefaultScript(script, stored)).toEqual([['consent', 'default', { ...DENIED, wait_for_update: 500 }]]);
    }
  });

  it('a stored decision becomes the default, with the same mapping as consentModeSignals', () => {
    for (const record of [denied, analyticsOnly, analyticsAndAds, { state: 'granted', marketing: true } as ConsentRecord]) {
      expect(runDefaultScript(script, JSON.stringify(record))).toEqual([
        ['consent', 'default', { ...consentModeSignals(record), wait_for_update: 500 }],
      ]);
    }
  });

  it('round-trips through saveConsentRecord', () => {
    const storage = memoryStorage();
    expect(saveConsentRecord(KEY, analyticsOnly, storage)).toBe(true);
    expect(runDefaultScript(script, storage.data.get(KEY) ?? null)).toEqual([
      ['consent', 'default', { ...ANALYTICS_ONLY, wait_for_update: 500 }],
    ]);
  });

  it('waitForUpdate is configurable and 0 omits it', () => {
    expect(runDefaultScript(consentModeDefaultScript({ storageKey: KEY, waitForUpdate: 0 }), null)).toEqual([
      ['consent', 'default', DENIED],
    ]);
    expect(consentModeDefaultScript({ storageKey: KEY, waitForUpdate: 2000 })).toContain('wait_for_update:2000');
    expect(() => consentModeDefaultScript({ storageKey: KEY, waitForUpdate: -1 })).toThrow(RangeError);
    expect(() => consentModeDefaultScript({ storageKey: KEY, waitForUpdate: 1.5 })).toThrow(RangeError);
    expect(() => consentModeDefaultScript({ storageKey: '' })).toThrow(TypeError);
  });

  it('a hostile storage key cannot close the script element', () => {
    const storageKey = '</script><script>alert(1)//\u2028';
    const hostile = consentModeDefaultScript({ storageKey });
    expect(hostile.toLowerCase()).not.toContain('</script');
    expect(hostile).not.toContain('\u2028');
    const window = { localStorage: { getItem: (key: string) => (key === storageKey ? JSON.stringify(analyticsOnly) : null) } };
    const sandbox: { window: typeof window & { dataLayer?: unknown[] } } = { window };
    runInNewContext(hostile, sandbox);
    expect(Array.from(sandbox.window.dataLayer?.[0] as ArrayLike<unknown>)[2]).toMatchObject(ANALYTICS_ONLY);
  });

  it('keeps an existing gtag function', () => {
    const calls: unknown[][] = [];
    const window = { localStorage: { getItem: () => null }, gtag: (...args: unknown[]) => void calls.push(args) };
    runInNewContext(script, { window });
    expect(calls).toEqual([['consent', 'default', { ...DENIED, wait_for_update: 500 }]]);
  });
});

describe('applyConsentModeUpdate', () => {
  it('analytics-only vs analytics + ads', () => {
    const target: GtagTarget = {};
    expect(applyConsentModeUpdate(analyticsOnly, { target })).toEqual(ANALYTICS_ONLY);
    expect(applyConsentModeUpdate(analyticsAndAds, { target })).toEqual(ALL_GRANTED);
    expect(target.dataLayer?.map((entry) => Array.from(entry as ArrayLike<unknown>))).toEqual([
      ['consent', 'update', ANALYTICS_ONLY],
      ['consent', 'update', ALL_GRANTED],
    ]);
  });

  it('pushes an Arguments object, the shape gtag.js processes', () => {
    const target: GtagTarget = {};
    applyConsentModeUpdate(denied, { target });
    expect(Object.prototype.toString.call(target.dataLayer?.[0])).toBe('[object Arguments]');
  });

  it('pending sends nothing; denied sends a denied update', () => {
    const target: GtagTarget = { dataLayer: [] };
    expect(applyConsentModeUpdate(null, { target })).toBeNull();
    expect(target.dataLayer).toEqual([]);
    expect(applyConsentModeUpdate(denied, { target })).toEqual(DENIED);
    expect(target.dataLayer).toHaveLength(1);
  });

  it('calls the page gtag when present', () => {
    const calls: unknown[][] = [];
    const target: GtagTarget = { gtag: (...args) => void calls.push(args) };
    applyConsentModeUpdate(analyticsAndAds, { target });
    expect(calls).toEqual([['consent', 'update', ALL_GRANTED]]);
    expect(target.dataLayer).toBeUndefined();
  });

  it('is a no-op without a window (SSR)', () => {
    expect(applyConsentModeUpdate(analyticsAndAds)).toBeNull();
  });

  it('follows a ConsentHub, which never emits while pending', () => {
    const hub = createConsentHub();
    const target: GtagTarget = {};
    hub.subscribe((record) => applyConsentModeUpdate(record, { target }));
    expect(target.dataLayer).toBeUndefined();
    hub.notify(analyticsAndAds);
    hub.notify(denied);
    expect(target.dataLayer?.map((entry) => Array.from(entry as ArrayLike<unknown>)[2])).toEqual([ALL_GRANTED, DENIED]);
  });
});

describe('loadConsentRecord / saveConsentRecord', () => {
  it('nothing stored is pending (null); a stored denial is denied', () => {
    const storage = memoryStorage();
    expect(loadConsentRecord(KEY, storage)).toBeNull();
    saveConsentRecord(KEY, denied, storage);
    expect(loadConsentRecord(KEY, storage)).toEqual(denied);
  });

  it('ignores invalid values and unknown fields', () => {
    expect(loadConsentRecord(KEY, memoryStorage({ [KEY]: 'granted' }))).toBeNull();
    expect(loadConsentRecord(KEY, memoryStorage({ [KEY]: '{"state":"pending"}' }))).toBeNull();
    expect(
      loadConsentRecord(KEY, memoryStorage({ [KEY]: '{"state":"granted","analytics":"yes","advertising":true,"extra":1}' })),
    ).toEqual({ state: 'granted', advertising: true });
  });

  it('unavailable storage reads as pending and fails the write', () => {
    const broken: ConsentStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadConsentRecord(KEY, broken)).toBeNull();
    expect(saveConsentRecord(KEY, denied, broken)).toBe(false);
    expect(loadConsentRecord(KEY)).toBeNull(); // no localStorage in Node
    expect(saveConsentRecord(KEY, denied)).toBe(false);
  });
});
