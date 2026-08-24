/**
 * Consent state contract shared by every ClickTrail integration.
 *
 * Recording and respecting consent is NOT consent-management: hosts own the
 * CMP decision; this package carries the state and enforces the gates.
 */

/** Purpose flags an integration may gate on. Absent = unknown = denied. */
export interface ConsentPurposes {
  analytics?: boolean;
  advertising?: boolean;
  marketing?: boolean;
}

/** Where a consent decision came from (host CMP, cookie banner, API, ...). */
export type ConsentSource = string;

export interface ConsentRecord extends ConsentPurposes {
  /** 'granted' | 'denied' for the overall decision. */
  state: 'granted' | 'denied';
  source?: ConsentSource;
  /** Policy version the decision was made under (contract field). */
  policyVersion?: string;
  /** ISO-8601 timestamp of the decision; caller-owned clock. */
  at?: string;
}

export function isGranted(record: ConsentRecord | null | undefined): boolean {
  return record?.state === 'granted';
}
