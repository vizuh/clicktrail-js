const HANDOFF_ID_PATTERN = /^hnd_[0-9a-f]{24}$/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Attach once. Existing attribution is never replaced, including when the
 * incoming handoff belongs to a later touch or a returning contact.
 */
export function attachHandoffToLead(lead, handoff) {
  const next = isRecord(lead) ? { ...lead } : {};
  const existing = typeof next.attribution_id === 'string' ? next.attribution_id.trim() : '';
  if (existing) {
    return {
      status: existing === handoff?.id ? 'already_attached' : 'preserved_existing',
      attributionId: existing,
      lead: next,
    };
  }
  if (!HANDOFF_ID_PATTERN.test(handoff?.id || '')) {
    return { status: 'unattributed', attributionId: null, lead: next };
  }
  next.attribution_id = handoff.id;
  return { status: 'attached', attributionId: handoff.id, lead: next };
}
