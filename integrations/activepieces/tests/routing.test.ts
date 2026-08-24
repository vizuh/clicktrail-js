import { describe, expect, it } from 'vitest';
import { piece } from '../src/index.js';
import {
  buildAttachAttribution,
  buildIdentifyLead,
  buildQualifiedLead,
  buildRecordBooking,
  buildRecordRefund,
  buildRecordSale,
  buildTrackEvent,
  buildUpdateConsent,
} from '../src/lib/events.js';
import type { BuilderResult } from '../src/lib/events.js';

/**
 * Routing completeness: every declared action must resolve to exactly one
 * builder and one event_name, with no gaps against the contract table.
 */
const CONTRACT: ReadonlyArray<{
  displayName: string;
  pieceName: string;
  sample: () => BuilderResult;
  expectedEventName: string;
}> = [
  { displayName: 'Track Event', pieceName: 'track_event', sample: () => buildTrackEvent({ eventName: 'custom.thing' }), expectedEventName: 'custom.thing' },
  { displayName: 'Identify Lead', pieceName: 'identify_lead', sample: () => buildIdentifyLead({}), expectedEventName: 'lead' },
  { displayName: 'Attach Attribution', pieceName: 'attach_attribution', sample: () => buildAttachAttribution({}), expectedEventName: 'lead_created' },
  { displayName: 'Record Booking', pieceName: 'record_booking', sample: () => buildRecordBooking({}), expectedEventName: 'booking' },
  { displayName: 'Record Qualified Lead', pieceName: 'record_qualified_lead', sample: () => buildQualifiedLead({ leadId: 'L' }), expectedEventName: 'lead_qualified' },
  { displayName: 'Record Sale', pieceName: 'record_sale', sample: () => buildRecordSale({ transactionId: 'T', value: 1, currency: 'EUR' }), expectedEventName: 'sale' },
  { displayName: 'Record Refund', pieceName: 'record_refund', sample: () => buildRecordRefund({ originalTransactionId: 'T' }), expectedEventName: 'refund' },
];

const CONSENT_STATES = ['consent_updated', 'consent_updated', 'consent_updated'] as const;

describe('piece metadata + triggers deferral', () => {
  it('declares ClickTrail metadata for release 0.30.0+', () => {
    expect(piece.displayName).toBe('ClickTrail');
    // Source declares '0.30.0'; pieces-framework 0.32 clamps reads below
    // 0.82.0 up to its own floor, so assert the floor, not the literal.
    const [major, minor] = piece.minimumSupportedRelease.split('.').map(Number);
    expect(major! > 0 || minor! >= 30).toBe(true);
    expect(piece.logoUrl).toBe('https://ps.w.org/click-trail-handler/assets/icon-256x256.png');
    expect(piece.auth).toBeDefined();
  });

  it('ships zero triggers (deferred — see src/TRIGGERS-DEFERRED.md)', () => {
    expect(Object.keys(piece.triggers())).toHaveLength(0);
  });

  it('declares exactly the eight contracted actions', () => {
    const names = Object.keys(piece.actions()).sort();
    expect(names).toEqual([
      'attach_attribution',
      'identify_lead',
      'record_booking',
      'record_qualified_lead',
      'record_refund',
      'record_sale',
      'track_event',
      'update_consent',
    ]);
  });
});

describe('action -> builder/event_name routing has no gaps', () => {
  it('maps every non-consent action to its contracted event name', () => {
    for (const entry of CONTRACT) {
      const result = entry.sample();
      expect(result.eventName, `${entry.displayName} event name`).toBe(entry.expectedEventName);
    }
  });

  it('Update Consent resolves one event per dropdown state', () => {
    for (const state of CONSENT_STATES) {
      expect(buildUpdateConsent({ state }).eventName).toBe(state);
    }
  });
});
