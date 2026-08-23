/**
 * Canonical flat AttributionPayload load/save through StorageAdapters.
 *
 * Reads are schema-tolerant (portable prompt contract):
 * - unknown keys are ignored (canonical allowlist only)
 * - documented legacy alias keys are normalized to canonical keys on read,
 *   backed by LEGACY_KEY_ALIASES with DATA-MODEL.md citations
 * - unparseable or non-object stored values yield an empty payload
 */
import {
  BROWSER_ID_KEYS,
  CLICK_ID_KEYS,
  touchKeys,
} from '../core/knowledge.js';
import type { AttributionPayload } from '../core/types.js';
import { ATTRIBUTION_KEY } from './storage.js';
import type { StorageAdapter } from './storage.js';

const FT_KEYS = touchKeys('ft');
const LT_KEYS = touchKeys('lt');

/** Every canonical flat key a stored payload may carry. */
export const CANONICAL_PAYLOAD_KEYS: readonly string[] = [
  ...Object.values(FT_KEYS),
  ...Object.values(LT_KEYS),
  // Ruling #12: captured click IDs are mirrored into touch fields
  // (ft_<cid>/lt_<cid>) and MUST survive store round-trips + hydration.
  ...CLICK_ID_KEYS.flatMap((cid) => [`ft_${cid}`, `lt_${cid}`]),
  ...CLICK_ID_KEYS,
  ...BROWSER_ID_KEYS,
  'visitor_id',
  'session_id',
  'session_number',
];

export const CANONICAL_KEY_SET: ReadonlySet<string> = new Set(CANONICAL_PAYLOAD_KEYS);

// ---------------------------------------------------------------------------
// Legacy key aliases
//
// Source of truth: click-trail-handler docs/architecture/DATA-MODEL.md:123 —
// "attribution metadata fields use the same `ft_` / `lt_` key convention as
// the rest of the schema, and legacy `first_*` / `last_*` aliases are
// normalized back to the canonical keys on read".
//
// The legacy suffix set mirrors the full touch field map (DATA-MODEL.md:123-124
// confirms the extended GA-style query fields also exist under ft_/lt_ keys;
// the plugin's first_*/last_* writes predate them, but normalizing every
// touch suffix keeps one rule instead of a partial table).
// ---------------------------------------------------------------------------

/** Touch suffixes shared by the first_/ft_ and last_/lt_ families. */
export const TOUCH_SUFFIXES: readonly string[] = [
  'source',
  'medium',
  'campaign',
  'term',
  'content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  'channel',
  'referrer',
  'landing_page',
  'touch_timestamp',
];

/**
 * Documented legacy payload-key aliases -> canonical flat keys.
 * Each entry cites its DATA-MODEL.md evidence line.
 */
export const LEGACY_KEY_ALIASES: Readonly<Record<string, string>> =
  Object.freeze(Object.fromEntries(
    TOUCH_SUFFIXES.flatMap((suffix): [string, string][] => [
      // DATA-MODEL.md:123 — legacy `first_*` aliases normalized on read.
      [`first_${suffix}`, `ft_${suffix}`],
      // DATA-MODEL.md:123 — legacy `last_*` aliases normalized on read.
      [`last_${suffix}`, `lt_${suffix}`],
    ]),
  ));

/**
 * Fold legacy first_* / last_* keys into their canonical ft_* / lt_* forms.
 * A non-empty canonical value always wins over an alias; the alias key is
 * removed either way so saved payloads are canonical-only.
 */
export function normalizeLegacyAliases(raw: AttributionPayload): AttributionPayload {
  const out: AttributionPayload = { ...raw };
  for (const [alias, canonical] of Object.entries(LEGACY_KEY_ALIASES)) {
    const aliasValue = out[alias];
    if (aliasValue === undefined) continue;
    if (out[canonical] === undefined || out[canonical] === '') {
      out[canonical] = aliasValue;
    }
    delete out[alias];
  }
  return out;
}

/**
 * Keep only canonical keys with string values. Unknown keys are ignored
 * (schema-tolerant forward compatibility: newer writers may add fields this
 * version does not know).
 */
export function filterCanonical(raw: AttributionPayload): AttributionPayload {
  const out: AttributionPayload = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!CANONICAL_KEY_SET.has(key)) continue;
    if (typeof value !== 'string') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Load + normalize a stored payload. Never throws:
 * missing / unparseable / non-object values all yield {}.
 */
export function loadAttributionPayload(
  adapter: StorageAdapter,
  key: string = ATTRIBUTION_KEY,
): AttributionPayload {
  const raw = adapter.get(key);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const record: AttributionPayload = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    record[k] = v;
  }
  return filterCanonical(normalizeLegacyAliases(record));
}

/** Serialize + persist the canonical payload (unknown keys stripped). */
export function saveAttributionPayload(
  adapter: StorageAdapter,
  payload: AttributionPayload,
  key: string = ATTRIBUTION_KEY,
): void {
  adapter.set(key, JSON.stringify(filterCanonical(payload)));
}
