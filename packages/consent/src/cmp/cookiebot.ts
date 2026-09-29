import type { ConsentHub } from '../listener.js';
import { createEmitter, noop, resolveTarget, toRecord } from './shared.js';
import type { CmpAdapterOptions, Disposer } from './shared.js';

interface CookiebotGlobal {
  hasResponse?: boolean;
  consent?: { marketing?: boolean; statistics?: boolean };
}

// Cookiebot may wipe unclassified storage before these fire, so capture must
// run on the emitted grant (reading the click ID from the current URL).
const EVENTS = ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline'];

/**
 * Forward Cookiebot decisions to the hub. Stays subscribed so in-page changes
 * and withdrawals (the renew dialog) are delivered, not only the first answer.
 */
export function connectCookiebot(hub: ConsentHub, options?: CmpAdapterOptions): Disposer {
  const target = resolveTarget(options);
  if (!target) return noop;
  const now = options?.now ?? (() => new Date());
  const emit = createEmitter(hub);

  const read = () => {
    const cookiebot = target.Cookiebot as CookiebotGlobal | undefined;
    if (!cookiebot?.hasResponse) return; // pending: never emit
    emit(
      toRecord(
        { marketing: !!cookiebot.consent?.marketing, analytics: !!cookiebot.consent?.statistics },
        'cookiebot',
        now,
      ),
    );
  };

  EVENTS.forEach((type) => target.addEventListener(type, read));
  read();
  return () => EVENTS.forEach((type) => target.removeEventListener(type, read));
}
