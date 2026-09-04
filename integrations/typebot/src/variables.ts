/**
 * Typebot variable -> ClickTrail canonical field mapping.
 *
 * This is the ONLY place variable names are translated. The mapping table is
 * the shared contract with the n8n node and piece-clicktrail packages; do not
 * rename canonical fields here without updating those siblings.
 *
 * Rules:
 * - Missing or empty variables are OMITTED — never emitted as empty strings.
 * - Unmapped variables are collected in `extra` so callers can pass them
 *   through as arbitrary properties.
 * - Consent values are normalized to a ConsentState union.
 */

export type ConsentState = 'granted' | 'withdrawn' | 'policy_updated';

export interface MappedVariables {
  email?: string;
  phone?: string;
  lead_id?: string;
  campaign?: string;
  gclid?: string;
  value?: number | string;
  consent_state?: ConsentState;
}

/** Typebot variable name -> canonical field name. */
export const VARIABLE_MAP = {
  Email: 'email',
  Phone: 'phone',
  'Lead ID': 'lead_id',
  utm_campaign: 'campaign',
  gclid: 'gclid',
  'Quoted value': 'value',
  'Marketing consent': 'consent_state',
} as const satisfies Record<string, string>;

export interface MappingResult {
  mapped: MappedVariables;
  extra: Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

const GRANTED = new Set(['granted', 'true', 'yes', 'accept', 'accepted', '1']);
const WITHDRAWN = new Set(['withdrawn', 'false', 'no', 'deny', 'denied', 'reject', 'rejected', '0']);
const POLICY_UPDATED = new Set(['policy_updated', 'policy updated', 'policyupdate']);

export function normalizeConsent(value: unknown): ConsentState | undefined {
  const raw = text(value).toLowerCase();
  if (raw === '') return undefined;
  if (GRANTED.has(raw)) return 'granted';
  if (WITHDRAWN.has(raw)) return 'withdrawn';
  if (POLICY_UPDATED.has(raw)) return 'policy_updated';
  return undefined;
}

function coerceValue(raw: string): number | string {
  if (raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
}

/**
 * Translate a bag of Typebot variables (e.g. `{ Email: '{{Email}}', ... }`)
 * into canonical fields plus leftover extras.
 */
export function mapVariables(variables: Record<string, unknown> = {}): MappingResult {
  const mapped: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(variables)) {
    if (!(name in VARIABLE_MAP)) {
      if (raw !== undefined && raw !== null && text(String(raw ?? '')) !== '') extra[name] = raw;
      continue;
    }
    const field = VARIABLE_MAP[name as keyof typeof VARIABLE_MAP];
    if (field === 'consent_state') {
      const state = normalizeConsent(raw);
      if (state) mapped[field] = state;
      continue;
    }
    const cleaned = text(raw);
    if (cleaned === '') continue; // missing optionals omitted, never empty strings
    mapped[field] = field === 'value' ? coerceValue(cleaned) : cleaned;
  }

  return { mapped: mapped as MappedVariables, extra };
}

/**
 * Merge mapped variables onto the current visitor payload (attribution
 * passthrough) and attach arbitrary extra properties under `properties`.
 * Returns a NEW object; never mutates the input payload.
 */
export function mergeVariables(
  payload: Record<string, unknown>,
  mapped: MappedVariables,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(mapped)) {
    if (value !== undefined) next[key] = value;
  }
  if (Object.keys(extra).length > 0) {
    next['properties'] = {
      ...(typeof next['properties'] === 'object' && next['properties'] !== null
        ? (next['properties'] as Record<string, unknown>)
        : {}),
      ...extra,
    };
  }
  return next;
}
