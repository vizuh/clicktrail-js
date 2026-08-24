import { describe, expect, it, vi } from 'vitest';
import { createConsentGate, storageAllowed, transmissionAllowed } from '../src/gates.js';
import { createConsentHub } from '../src/listener.js';
import { isGranted } from '../src/types.js';
import type { ConsentRecord } from '../src/types.js';

const granted: ConsentRecord = { state: 'granted', analytics: true };
const denied: ConsentRecord = { state: 'denied' };

describe('gates', () => {
  it('gate closes on denied/absent consent and opens on granted', () => {
    expect(createConsentGate(() => null)()).toBe(false);
    expect(createConsentGate(() => denied)()).toBe(false);
    expect(createConsentGate(() => granted)()).toBe(true);
  });

  it('storage gate mirrors granted state', () => {
    expect(storageAllowed(() => granted)).toBe(true);
    expect(storageAllowed(() => denied)).toBe(false);
  });

  it('transmission gate honors per-purpose flags', () => {
    const marketingOnly: ConsentRecord = { state: 'granted', analytics: false, marketing: true };
    expect(transmissionAllowed(() => marketingOnly, 'marketing')).toBe(true);
    expect(transmissionAllowed(() => marketingOnly, 'analytics')).toBe(false);
    expect(transmissionAllowed(() => granted, 'advertising')).toBe(true); // absent != denied
  });

  it('isGranted treats unknown shapes as denied', () => {
    expect(isGranted(undefined)).toBe(false);
    expect(isGranted({ state: 'withdrawn' } as never)).toBe(false);
  });
});

describe('consent hub', () => {
  it('notifies subscribers and supports unsubscribe', () => {
    const hub = createConsentHub();
    const seen: string[] = [];
    const off = hub.subscribe((r) => seen.push(r.state));
    hub.notify(granted);
    off();
    hub.notify(denied);
    expect(seen).toEqual(['granted']);
    expect(hub.latest()?.state).toBe('denied');
  });

  it('replays latest to late subscribers', () => {
    const hub = createConsentHub();
    hub.notify(denied);
    const spy = vi.fn();
    hub.subscribe(spy);
    expect(spy).toHaveBeenCalledWith(denied);
  });
});
