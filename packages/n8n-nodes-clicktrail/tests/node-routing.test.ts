import { describe, expect, it } from 'vitest';
import { OPERATIONS, RESOURCES } from '../src/events.js';

/**
 * Spec source of truth (task spec): every declared operation with its
 * exactly-one event name. Kept independent from src/events.ts so gaps and
 * duplicates are caught against the spec, not the implementation.
 */
const SPEC: Record<string, Record<string, string>> = {
  lead: {
    createOrIdentify: 'lead',
    attachAttribution: 'lead.attribution_attached',
    updateStage: 'lead.stage_updated',
    markQualified: 'lead.qualified',
    mergeVisitor: 'lead.merged',
  },
  conversion: {
    recordAppointment: 'appointment.booked',
    recordCompletedAppointment: 'appointment.completed',
    recordSale: 'sale.recorded',
    recordRecurringRevenue: 'revenue.recurring',
    recordRefund: 'refund.issued',
    sendOfflineConversion: 'offline_conversion.sent',
  },
  consent: {
    recordConsent: 'consent.granted',
    recordWithdrawal: 'consent.withdrawn',
    updateConsentPolicy: 'consent.policy_updated',
    anonymizeVisitor: 'visitor.anonymized',
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

  it('event names are globally unique across all operations', () => {
    const eventNames: string[] = [];
    for (const ops of Object.values(OPERATIONS)) {
      for (const def of Object.values(ops)) eventNames.push(def.eventName);
    }
    expect(new Set(eventNames).size).toBe(eventNames.length);
    expect(eventNames.length).toBe(15);
  });
});
