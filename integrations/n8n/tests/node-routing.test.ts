import { describe, expect, it } from 'vitest';
import { OPERATIONS, RESOURCES } from '../src/events.js';

/**
 * Spec source of truth (task spec): every declared operation with its
 * exactly-one event name. Kept independent from src/events.ts so gaps and
 * duplicates are caught against the spec, not the implementation.
 */
const SPEC: Record<string, Record<string, string>> = {
  lead: {
    createOrIdentify: 'lead_created',
    attachAttribution: 'lead_created',
    updateStage: 'lead_updated',
    markQualified: 'lead_qualified',
    mergeVisitor: 'lead_merged',
  },
  conversion: {
    recordAppointment: 'booking_created',
    recordCompletedAppointment: 'booking_completed',
    recordSale: 'sale',
    recordRecurringRevenue: 'sale',
    recordRefund: 'refund',
    sendOfflineConversion: 'sale',
  },
  consent: {
    recordConsent: 'consent_updated',
    recordWithdrawal: 'consent_updated',
    updateConsentPolicy: 'consent_updated',
    anonymizeVisitor: 'visitor_anonymized',
  },
};

describe('node routing table', () => {
  it('declares exactly the three spec resources', () => {
    expect([...RESOURCES]).toEqual(['lead', 'conversion', 'consent']);
    expect(Object.keys(OPERATIONS).sort()).toEqual(Object.keys(SPEC).sort());
  });

  it('every resource has no duplicate or missing operations vs the spec', () => {
    for (const resource of Object.keys(SPEC)) {
      const declared = Object.keys(OPERATIONS[resource as keyof typeof OPERATIONS]);
      const spec = Object.keys(SPEC[resource]!);
      expect(new Set(declared).size, `${resource}: duplicate operation keys`).toBe(declared.length);
      expect(declared.sort(), `${resource}: operation set`).toEqual(spec.slice().sort());
    }
  });

  it('every operation resolves to exactly one builder and one event_name', () => {
    for (const [resource, ops] of Object.entries(OPERATIONS)) {
      for (const [operation, def] of Object.entries(ops)) {
        expect(typeof def.builder, `${resource}.${operation} builder`).toBe('function');
        expect(def.eventName, `${resource}.${operation} event name`).toBe(SPEC[resource]![operation]!);
      }
    }
  });

  it('every operation resolves to a canonical contract event name', () => {
    // Post-contract, several operations intentionally share wire events
    // (sale / consent_updated / lead_created); uniqueness lives at the
    // operation level, not the event level.
    const CANONICAL_OR_EXTENSION = new Set([
      'page_view', 'form_started', 'lead_created', 'lead_qualified',
      'booking_created', 'booking_completed', 'sale', 'refund',
      'consent_updated', 'lead_updated', 'lead_merged', 'visitor_anonymized',
    ]);
    const eventNames: string[] = [];
    for (const ops of Object.values(OPERATIONS)) {
      for (const def of Object.values(ops)) {
        eventNames.push(def.eventName);
        expect(CANONICAL_OR_EXTENSION.has(def.eventName)).toBe(true);
      }
    }
    expect(eventNames.length).toBe(15);
    expect(new Set(eventNames).size).toBeLessThan(eventNames.length);
  });
});
