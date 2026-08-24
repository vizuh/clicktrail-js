import { describe, expect, it, vi } from 'vitest';
import type { ClickTrailInstance, SessionSnapshot } from '@vizuh/clicktrail/browser';
import {
  createClicktrailComposable,
  peekActiveClicktrail,
  setActiveClicktrail,
  useClicktrail,
} from '../src/composable.js';
import { CONSENT_COOKIE } from '../src/consent.js';

function makeJar() {
  const entries = new Map<string, string>();
  return {
    entries,
    read: () => [...entries].map(([k, v]) => `${k}=${v}`).join('; '),
    write: (s: string) => {
      const [pair] = s.split(';') as [string];
      const eq = pair.indexOf('=');
      entries.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
  };
}

function makeInstance(): ClickTrailInstance {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    isStarted: () => true,
    track: vi.fn(),
    mergeParsedTouch: vi.fn(),
    hydrateStoredPayload: vi.fn(),
    getData: vi.fn(() => ({ ft_source: 'google' })),
    getField: vi.fn(() => 'google'),
    clearData: vi.fn(),
    getSession: vi.fn(() => ({ sessionId: 's-1' }) as unknown as SessionSnapshot),
  };
}

describe('useClicktrail store', () => {
  it('throws before the plugin populates the store', () => {
    setActiveClicktrail(null);
    expect(() => useClicktrail()).toThrow(/after the @clicktrail\/nuxt plugin initializes/);
  });

  it('returns the active composable after setActiveClicktrail', () => {
    setActiveClicktrail(null);
    const facade = createClicktrailComposable(makeInstance(), makeJar());
    setActiveClicktrail(facade);
    expect(useClicktrail()).toBe(facade);
    expect(peekActiveClicktrail()).toBe(facade);
  });
});

describe('composable facade', () => {
  it('proxies track/getSession/getData/getField to the instance', () => {
    const instance = makeInstance();
    const facade = createClicktrailComposable(instance, makeJar());
    facade.track('lead_form_submit', { formId: 'f1' });
    expect(instance.track).toHaveBeenCalledWith('lead_form_submit', { formId: 'f1' });
    expect(facade.getSession()).toEqual({ sessionId: 's-1' });
    expect(facade.getData()).toEqual({ ft_source: 'google' });
    expect(facade.getField('ft_source')).toBe('google');
  });

  it('setConsent writes the shared ct_consent cookie via the injected jar', () => {
    const jar = makeJar();
    const facade = createClicktrailComposable(makeInstance(), jar);
    expect(facade.consentGranted()).toBe(false);
    facade.setConsent(true);
    expect(jar.entries.get(CONSENT_COOKIE)).toBe('granted');
    expect(facade.consentGranted()).toBe(true);
    facade.setConsent(false);
    expect(jar.entries.get(CONSENT_COOKIE)).toBe('denied');
    expect(facade.consentGranted()).toBe(false);
  });
});
