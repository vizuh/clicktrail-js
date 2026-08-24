/**
 * @clicktrail/piece-clicktrail — Activepieces piece for ClickTrail.
 *
 * Every action translates automation inputs into exactly ONE schema-stamped
 * event via @vizuh/clicktrail/browser's buildEventPayload and POSTs
 * `{ events: [event] }` to the ClickTrail collector. No attribution logic
 * lives here.
 *
 * Triggers are intentionally deferred: see src/TRIGGERS-DEFERRED.md.
 */
import { createPiece } from '@activepieces/pieces-framework';
import { clicktrailAuth } from './lib/auth.js';
import { attachAttribution } from './actions/attach-attribution.js';
import { identifyLead } from './actions/identify-lead.js';
import { recordBooking } from './actions/record-booking.js';
import { recordQualifiedLead } from './actions/record-qualified-lead.js';
import { recordRefund } from './actions/record-refund.js';
import { recordSale } from './actions/record-sale.js';
import { trackEvent } from './actions/track-event.js';
import { updateConsent } from './actions/update-consent.js';

export const piece = createPiece({
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://ps.w.org/click-trail-handler/assets/icon-256x256.png',
  authors: ['Atroci'],
  displayName: 'ClickTrail',
  description:
    'First-party attribution and conversion tracking: send leads, bookings, sales, refunds, and consent updates to ClickTrail from any Activepieces automation.',
  auth: clicktrailAuth,
  // DEFERRED — triggers (reason: ClickTrail has no polling source or outbound webhooks yet; see src/TRIGGERS-DEFERRED.md)
  triggers: [],
  actions: [
    trackEvent,
    identifyLead,
    attachAttribution,
    recordBooking,
    recordQualifiedLead,
    recordSale,
    recordRefund,
    updateConsent,
  ],
});

export default piece;

// Named exports for tests + programmatic consumers.
export {
  trackEvent,
  identifyLead,
  attachAttribution,
  recordBooking,
  recordQualifiedLead,
  recordSale,
  recordRefund,
  updateConsent,
};
export { clicktrailAuth };
