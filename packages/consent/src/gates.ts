/**
 * Storage + transmission gates.
 *
 * Contract (integration policy #3): nothing non-essential persists and
 * nothing transmits before the configured consent state permits it.
 * Pre-consent operation must be in-memory or fully inactive.
 */
import { isGranted } from './types.js';
import type { ConsentPurposes, ConsentRecord } from './types.js';

/** Consent snapshot provider — host wires this to its real source of truth. */
export type ConsentSnapshot = () => ConsentRecord | null;

/** SDK consentGate shape: evaluated per capture attempt. */
export type ConsentGate = () => boolean;

export function createConsentGate(snapshot: ConsentSnapshot): ConsentGate {
  return () => isGranted(snapshot());
}

/** Gate for persistence: false blocks cookie/storage writes entirely. */
export function storageAllowed(snapshot: ConsentSnapshot): boolean {
  return isGranted(snapshot());
}

/** Gate for delivery: false drops events at the queue head. */
export function transmissionAllowed(
  snapshot: ConsentSnapshot,
  purpose: keyof ConsentPurposes = 'analytics',
): boolean {
  const record: ConsentRecord | null = snapshot();
  if (!isGranted(record)) return false;
  if (!record) return false;
  return record[purpose] !== false;
}
