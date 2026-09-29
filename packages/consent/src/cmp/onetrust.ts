import type { ConsentHub } from '../listener.js';
import { createEmitter, noop, resolveTarget, toRecord } from './shared.js';
import type { CmpAdapterOptions, Disposer } from './shared.js';

export interface OneTrustOptions extends CmpAdapterOptions {
  /** OneTrust group for targeting/marketing cookies (default 'C0004'). */
  marketingGroup?: string;
  /** OneTrust group for performance/analytics cookies (default 'C0002'). */
  analyticsGroup?: string;
}

/**
 * Forward OneTrust decisions to the hub. Listens to `OneTrustGroupsUpdated` and
 * also wraps OptanonWrapper (the host's wrapper still runs), so a later
 * reassignment of OptanonWrapper by the install snippet cannot silence it.
 */
export function connectOneTrust(hub: ConsentHub, options?: OneTrustOptions): Disposer {
  const target = resolveTarget(options);
  if (!target) return noop;
  const now = options?.now ?? (() => new Date());
  const marketingGroup = options?.marketingGroup ?? 'C0004';
  const analyticsGroup = options?.analyticsGroup ?? 'C0002';
  const emit = createEmitter(hub);
  let disposed = false;

  const read = () => {
    if (disposed) return; // our wrapper may still sit inside another wrapper chain
    const raw = target.OnetrustActiveGroups;
    if (typeof raw !== 'string' || raw === '') return; // SDK not loaded yet
    // Exact group match; ",C0004," style lists must not match "C00040".
    const groups = new Set(raw.split(',').map((group) => group.trim()).filter(Boolean));
    emit(
      toRecord(
        { marketing: groups.has(marketingGroup), analytics: groups.has(analyticsGroup) },
        'onetrust',
        now,
      ),
    );
  };

  const hostWrapper = target.OptanonWrapper;
  const wrapper = function (this: unknown, ...args: unknown[]) {
    if (typeof hostWrapper === 'function') hostWrapper.apply(this, args);
    read();
  };
  target.OptanonWrapper = wrapper;
  target.addEventListener('OneTrustGroupsUpdated', read);
  read();

  return () => {
    disposed = true;
    target.removeEventListener('OneTrustGroupsUpdated', read);
    if (target.OptanonWrapper === wrapper) target.OptanonWrapper = hostWrapper;
  };
}
