import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVENT_NAMES,
  EVENT_BOOKING_COMPLETED,
  EVENT_BOOKING_CREATED,
  EVENT_CONSENT_UPDATED,
  EVENT_FORM_STARTED,
  EVENT_LEAD_CREATED,
  EVENT_LEAD_QUALIFIED,
  EVENT_PAGE_VIEW,
  EVENT_REFUND,
  EVENT_SALE,
  toCanonicalEventName,
} from '../src/index.js';

describe('canonical event contract', () => {
  it('keeps stable constants aligned with the authoritative nine', () => {
    expect([
      EVENT_PAGE_VIEW,
      EVENT_FORM_STARTED,
      EVENT_LEAD_CREATED,
      EVENT_LEAD_QUALIFIED,
      EVENT_BOOKING_CREATED,
      EVENT_BOOKING_COMPLETED,
      EVENT_SALE,
      EVENT_REFUND,
      EVENT_CONSENT_UPDATED,
    ]).toEqual(CANONICAL_EVENT_NAMES);
  });

  it('normalizes legacy dotted event names at shared boundaries', () => {
    expect([
      'lead.submitted',
      'lead.qualified',
      'appointment.booked',
      'appointment.attended',
      'sale.completed',
      'sale.refunded',
    ].map(toCanonicalEventName)).toEqual([
      'lead_created',
      'lead_qualified',
      'booking_created',
      'booking_completed',
      'sale',
      'refund',
    ]);
  });
});
