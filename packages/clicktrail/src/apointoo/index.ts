/**
 * @funnelsheet/clicktrail/apointoo — UNSTABLE entry point.
 *
 * The commercial loop: verified outcomes (appointments/sales) flow back to
 * Apointoo carrying the original journey attribution captured by ClickTrail.
 *
 * Division of labor (docs/ARCHITECTURE.md): Apointoo owns appointments,
 * orders, and billing; ClickTrail owns journey correlation and attribution.
 * This subpath DELIVERS outcome events enriched with attribution context via
 * the injected getJourneyContext() seam — it never manages appointments or
 * holds business state, and it never captures content.
 *
 * AUTH LAW (docs/guides/SECURITY-PRIVACY.md): the browser NEVER holds
 * permanent secrets. The only accepted credential is a SHORT-LIVED token,
 * SCOPED to outcome intake, minted by the host's own server from its
 * Apointoo credentials (server-to-server exchange) and handed to the browser
 * per session. Expected exchange:
 *
 *   1. Browser asks its own backend for a delivery token.
 *   2. Host backend authenticates to Apointoo server-side (its credentials).
 *   3. Host backend returns a short-TTL, outcome-scoped token.
 *   4. This module sends `Authorization: Bearer <token>` until expiry;
 *      the host mints a fresh one when getToken() is called again.
 *
 * The module NEVER accepts or stores long-lived secrets, has NO
 * secret-bearing defaults, and omits the Authorization header entirely when
 * no token provider is configured. Payload minimization is enforced: only
 * allowlisted fields leave the browser; unknown keys are stripped.
 */
export {
  APOINTOO_OUTCOME_EVENTS,
  ATTR_OUTCOME_ID,
  OUTCOME_ALLOWED_KEYS,
  WIRE_JOURNEY_ID,
  buildOutcomeEvent,
  isOutcomeEvent,
  stripToOutcomeRecord,
} from './outcome.js';
export type { ApointooOutcomeRecord, OutcomeInput } from './outcome.js';
export { createApointooDestination } from './destination.js';
export type {
  ApointooDestination,
  ApointooDestinationConfig,
  ApointooFetchFn,
  ApointooFetchResponse,
  DroppedBatch,
  SignFn,
} from './destination.js';
