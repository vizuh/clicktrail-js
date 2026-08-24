/**
 * useClicktrail() — public client composable.
 *
 * A plain module-scoped store read by name: no vue import, no injection
 * context required. The client plugin populates the store during boot, so
 * useClicktrail() must be called client-side after plugin init (e.g. in
 * onMounted or from event handlers).
 */
import type { AttributionPayload } from '@vizuh/clicktrail';
import type { ClickTrailInstance, SessionSnapshot, CookieJar } from '@vizuh/clicktrail/browser';
import { defaultConsentCookieJar, readStoredConsent, setConsent } from './consent.js';

export interface ClicktrailComposable {
  /** Track a named event with optional data. No-op before start(). */
  track(name: string, data?: Record<string, unknown>): void;
  /** Current session snapshot. */
  getSession(): SessionSnapshot;
  /** Full canonical flat attribution payload (defensive copy). */
  getData(): AttributionPayload;
  /** One field by canonical flat key (`ft_source`, `gclid`, ...). */
  getField(key: string): string;
  /** Write the consent decision and notify the running client. */
  setConsent(granted: boolean): void;
  /** True only when the stored consent decision is 'granted'. */
  consentGranted(): boolean;
}

let active: ClicktrailComposable | null = null;

/** Build a composable facade over a booted SDK instance (+ consent jar). */
export function createClicktrailComposable(
  instance: ClickTrailInstance,
  jar?: CookieJar,
): ClicktrailComposable {
  const resolveJar = (): CookieJar => jar ?? defaultConsentCookieJar();
  return {
    track: (name, data) => instance.track(name, data),
    getSession: () => instance.getSession(),
    getData: () => instance.getData(),
    getField: (key) => instance.getField(key),
    setConsent: (granted) => setConsent(granted, { cookieJar: resolveJar() }),
    consentGranted: () => readStoredConsent(resolveJar()) === true,
  };
}

/** Store hook used by the client plugin. Pass null to reset (tests/HMR). */
export function setActiveClicktrail(next: ClicktrailComposable | null): void {
  active = next;
}

/** Non-throwing store read (plugin internals, debugging). */
export function peekActiveClicktrail(): ClicktrailComposable | null {
  return active;
}

/**
 * Access the running ClickTrail client. Throws until the plugin boots —
 * call it client-side, after app init.
 */
export function useClicktrail(): ClicktrailComposable {
  if (active === null) {
    throw new Error(
      'useClicktrail() must be called on the client after the @clicktrail/nuxt plugin initializes (e.g. in onMounted).',
    );
  }
  return active;
}
