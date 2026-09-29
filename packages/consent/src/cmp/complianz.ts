import type { ConsentHub } from '../listener.js';
import { createEmitter, noop, resolveTarget, toRecord } from './shared.js';
import type { CmpAdapterOptions, Disposer } from './shared.js';

type HasConsent = (category: string) => boolean;

// Complianz 6+ fires cmplz_fire_categories with event.detail.categories (the
// accepted categories) and cmplz_status_change on later changes.
const EVENTS = ['cmplz_fire_categories', 'cmplz_status_change'];

/**
 * Forward Complianz decisions to the hub. Reads the documented
 * `cmplz_has_consent(category)` API; falls back to the event's accepted
 * categories when the function is unavailable.
 */
export function connectComplianz(hub: ConsentHub, options?: CmpAdapterOptions): Disposer {
  const target = resolveTarget(options);
  if (!target) return noop;
  const now = options?.now ?? (() => new Date());
  const emit = createEmitter(hub);
  const doc = (target.document as typeof target | undefined) ?? target;

  const read = (event?: unknown) => {
    const hasConsent = target.cmplz_has_consent as HasConsent | undefined;
    const categories = (event as { detail?: { categories?: unknown } } | undefined)?.detail?.categories;
    let marketing: boolean;
    let analytics: boolean;
    if (typeof hasConsent === 'function') {
      marketing = !!hasConsent('marketing');
      analytics = !!hasConsent('statistics');
    } else if (Array.isArray(categories)) {
      marketing = categories.includes('marketing');
      analytics = categories.includes('statistics');
    } else {
      return; // no decision available: pending
    }
    emit(toRecord({ marketing, analytics }, 'complianz', now));
  };

  EVENTS.forEach((type) => doc.addEventListener(type, read));
  // A stored decision marks the banner 'dismissed'; before that the visitor is pending.
  const status = typeof target.cmplz_get_banner_status === 'function'
    ? String((target.cmplz_get_banner_status as () => unknown)())
    : '';
  if (status === 'dismissed') read();

  return () => EVENTS.forEach((type) => doc.removeEventListener(type, read));
}
