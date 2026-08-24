/**
 * @vizuh/clicktrail-typebot
 *
 * Standalone ClickTrail block for Typebot conversations. Zero runtime
 * dependencies and zero @typebot.io imports by design: it runs TODAY inside
 * Typebot Code / HTTP-request steps as copy-paste code, and is structured so
 * the same logic can be lifted into the official typebot monorepo block
 * shape (option helpers swapped in at PR time) with minimal renaming.
 *
 * The browser SDK (@vizuh/clicktrail) remains the common layer for
 * attribution logic; this package ONLY translates Typebot variables into
 * canonical fields and ships them to the first-party endpoint.
 *
 * NEVER-THROWS GUARANTEE: send methods resolve { ok, status } and never
 * throw into the host chat flow. Validation errors (required money/id
 * fields) reject as promises with TypeError messages of the form
 * '<action>.<field>'.
 */
import { resolveTypebotBlockConfig, type ResolvedTypebotBlockConfig, type TypebotBlockConfig } from './config.js';
import {
  buildAppointmentRequestedEvent,
  buildConsentUpdateEvent,
  buildFormStartedEvent,
  buildFormSubmittedEvent,
  buildLeadEvent,
  buildPurchaseEvent,
  buildQualifiedLeadEvent,
  EVENT_NAMES,
  type BlockEvent,
  type BuildMeta,
  type PurchaseInput,
} from './events.js';
import { attachVariablesToPayload } from './events.js';
import { mapVariables, mergeVariables, type ConsentState, type MappingResult } from './variables.js';
import { sendEvents, type FetchLike, type SendResult } from './send.js';
import type { VariableBag } from './events.js';

export {
  resolveTypebotBlockConfig,
  DEFAULT_ENDPOINT,
  type ResolvedTypebotBlockConfig,
  type TypebotBlockConfig,
} from './config.js';
export {
  attachVariablesToPayload,
  buildAppointmentRequestedEvent,
  buildConsentUpdateEvent,
  buildFormStartedEvent,
  buildFormSubmittedEvent,
  buildLeadEvent,
  buildPurchaseEvent,
  buildQualifiedLeadEvent,
  EVENT_NAMES,
  type BlockEvent,
  type PurchaseInput,
  type VariableBag,
} from './events.js';
export { mapVariables, mergeVariables, normalizeConsent, VARIABLE_MAP, type ConsentState, type MappedVariables, type MappingResult } from './variables.js';
export { CLICKTRAIL_KEY_HEADER, sendEvents, type FetchLike, type SendResult } from './send.js';

export interface ClickTrailBlockDeps {
  /** Injected clock. Defaults to `new Date()`. Must yield ms-precision ISO stamps. */
  now?: () => Date;
  /** Injected fetch. Defaults to globalThis.fetch when available. */
  fetchImpl?: FetchLike;
  /** Injected debug sink; used only when config.debug is true. */
  log?: (message: string) => void;
}

interface ResolvedDeps {
  now: () => Date;
  fetchImpl: FetchLike | undefined;
  log: ((message: string) => void) | undefined;
}

export class ClickTrailBlock {
  readonly config: ResolvedTypebotBlockConfig;
  private payload: Record<string, unknown>;
  private readonly deps: ResolvedDeps;

  constructor(config: TypebotBlockConfig = {}, deps: ClickTrailBlockDeps = {}) {
    this.config = resolveTypebotBlockConfig(config);
    this.payload = {};
    this.deps = {
      now: deps.now ?? (() => new Date()),
      fetchImpl: deps.fetchImpl,
      log: deps.log,
    };
  }

  /** Current visitor payload (attribution passthrough state). */
  get currentPayload(): Readonly<Record<string, unknown>> {
    return this.payload;
  }

  private meta(): BuildMeta {
    return { config: this.config, occurredAt: this.deps.now().toISOString() };
  }

  private async deliver(event: BlockEvent): Promise<SendResult> {
    const result = await sendEvents([event], this.config, this.deps.fetchImpl);
    if (this.config.debug && this.deps.log) {
      this.deps.log(
        `[clicktrail] ${event.event_name} -> ${result.ok ? 'ok' : 'failed'}${result.status !== undefined ? ` (${result.status})` : ''}`,
      );
    }
    return result;
  }

  /** Action 1 — Identify Visitor/Lead -> event 'lead'. */
  identifyVisitor(variables: VariableBag = {}): Promise<SendResult> {
    try {
      const event = buildLeadEvent(variables, this.payload, this.meta());
      this.payload = mergeVariables(this.payload, mapVariables(variables).mapped);
      return this.deliver(event);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 2 — Track Form Started -> event 'form.started'. */
  trackFormStarted(variables: VariableBag = {}): Promise<SendResult> {
    try {
      return this.deliver(buildFormStartedEvent(variables, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 3 — Track Lead Submitted -> event 'form.submitted'. */
  trackLeadSubmitted(variables: VariableBag = {}): Promise<SendResult> {
    try {
      return this.deliver(buildFormSubmittedEvent(variables, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 4 — Track Qualified Lead -> event 'lead.qualified' (leadId REQUIRED). */
  trackQualifiedLead(variables: VariableBag = {}): Promise<SendResult> {
    try {
      return this.deliver(buildQualifiedLeadEvent(variables, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 5 — Track Appointment Requested -> event 'appointment.requested'. */
  trackAppointmentRequested(variables: VariableBag = {}): Promise<SendResult> {
    try {
      return this.deliver(buildAppointmentRequestedEvent(variables, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 6 — Track Purchase -> event 'sale.recorded' (transactionId/value/currency REQUIRED). */
  trackPurchase(input: PurchaseInput): Promise<SendResult> {
    try {
      return this.deliver(buildPurchaseEvent(input, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Action 7 — Update Consent -> 'consent.granted' | 'consent.withdrawn' | 'consent.policy_updated'. */
  updateConsent(state: ConsentState, variables: VariableBag = {}): Promise<SendResult> {
    try {
      return this.deliver(buildConsentUpdateEvent(state, variables, this.payload, this.meta()));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Action 8 — Attach Variables as Properties. Merges mapped variables onto
   * the CURRENT visitor payload (utm_campaign -> campaign, gclid ->
   * gclid click id) plus arbitrary extra properties JSON input. Subsequent
   * events carry the merged fields. Sends nothing by itself.
   */
  attachVariables(variables: VariableBag = {}, extraProperties: VariableBag = {}): void {
    this.payload = attachVariablesToPayload(variables, this.payload, extraProperties);
  }
}

export function createClickTrailBlock(
  config: TypebotBlockConfig = {},
  deps: ClickTrailBlockDeps = {},
): ClickTrailBlock {
  return new ClickTrailBlock(config, deps);
}
