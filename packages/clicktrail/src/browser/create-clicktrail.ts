/**
 * createClickTrail — browser SDK entry point.
 *
 * ZERO side effects until `.start()`: safe to import and construct in SSR.
 * All effects (clock, network, dataLayer) enter as injected dependencies or
 * are created inside start()-invoked destination lifecycle methods.
 */
import { DIAGNOSTIC_CODES, nullDiagnosticSink } from '../core/diagnostics.js';
import type { DiagnosticSink } from '../core/diagnostics.js';
import { emptyAttribution } from '../core/merge.js';
import type { ParsedTouch } from '../core/types.js';
import type { AttributionPayload } from '../core/types.js';
import { mergeAttributionTouch } from '../core/merge.js';
import type { Destination } from './transport.js';
import type { SessionSnapshot } from './global-adapter.js';
import { buildEventPayload, type ClickTrailEvent } from './serialize.js';

export type DiagnosticsLevel = 'silent' | 'warn';

export interface ClickTrailConfig {
  /** Event destinations. Started/flushed by the instance lifecycle. */
  destinations: readonly Destination[];
  /**
   * Consent gate, evaluated per capture attempt. When it returns false,
   * nothing is delivered and a consent diagnostic is reported once per gate
   * denial streak. Omit only when the host handles consent elsewhere.
   */
  consentGate?: () => boolean;
  /** Injected clock returning ISO-8601 strings; stamps `event_time`. */
  now?: () => string;
  /** Diagnostics level. Default 'silent' (nothing reported). */
  diagnosticsLevel?: DiagnosticsLevel;
  /** Where diagnostics go when level is 'warn'. Default: console.warn sink. */
  diagnosticSink?: DiagnosticSink;
}

export interface ClickTrailInstance {
  /** Begin delivering events to destinations. Idempotent. */
  start(): void;
  /** Flush buffered events and stop delivering. Idempotent. */
  stop(): void;
  isStarted(): boolean;
  /** Track a named event with optional data. No-op before start(). */
  track(eventName: string, data?: Record<string, unknown>): void;
  /** Feed a parsed attribution signal into the stored payload. */
  mergeParsedTouch(touch: ParsedTouch): void;
  /** Full canonical flat payload (defensive copy). */
  getData(): AttributionPayload;
  /** One field by canonical flat key (`ft_source`, `gclid`, ...). */
  getField(key: string): string;
  /** Reset all stored attribution state. */
  clearData(): void;
  getSession(): SessionSnapshot;
}

const warnConsoleSink: DiagnosticSink = {
  report: (d) => console.warn(`[clicktrail:${d.code}] ${d.message}`),
};

function resolveSink(config: ClickTrailConfig): DiagnosticSink {
  if (config.diagnosticSink) return config.diagnosticSink;
  if ((config.diagnosticsLevel ?? 'silent') === 'warn') return warnConsoleSink;
  return nullDiagnosticSink;
}

export function createClickTrail(config: ClickTrailConfig): ClickTrailInstance {
  const destinations = [...config.destinations];
  const now = config.now;
  const consentGate = config.consentGate;
  const sink = resolveSink(config);

  let started = false;
  let payload: AttributionPayload = emptyAttribution();
  let consentDeniedReported = false;

  const consentAllows = (): boolean => {
    if (!consentGate || consentGate()) {
      consentDeniedReported = false;
      return true;
    }
    if (!consentDeniedReported) {
      consentDeniedReported = true;
      sink.report({
        code: DIAGNOSTIC_CODES.CONSENT_DENIED_CAPTURE_ATTEMPTED,
        level: 'warn',
        message: 'Capture attempted while consent denied; event dropped.',
      });
    }
    return false;
  };

  return {
    start() {
      if (started) return;
      started = true;
      for (const dest of destinations) dest.start?.();
    },

    stop() {
      if (!started) return;
      for (const dest of destinations) void Promise.resolve(dest.flush?.());
      started = false;
    },

    isStarted: () => started,

    track(eventName, data) {
      if (!started) {
        sink.report({
          code: 'track_before_start',
          level: 'warn',
          message: `track('${eventName}') ignored: SDK not started.`,
        });
        return;
      }
      if (!consentAllows()) return;

      const eventData: Record<string, unknown> = {};
      if (now && data?.['event_time'] === undefined) eventData.event_time = now();
      Object.assign(eventData, data);
      const event: ClickTrailEvent = buildEventPayload(payload, eventName, eventData);
      for (const dest of destinations) dest.deliver(event);
    },

    mergeParsedTouch(touch) {
      payload = mergeAttributionTouch(payload, touch);
    },

    getData: () => ({ ...payload }),

    getField(key) {
      return payload[key] ?? '';
    },

    clearData() {
      payload = emptyAttribution();
    },

    getSession() {
      // Phase 2's storage adapter owns visitor/session ID generation; until
      // then these read whatever the host merged into the payload.
      return {
        visitorId: payload['visitor_id'] ?? '',
        sessionId: payload['session_id'] ?? '',
        sessionNumber: payload['session_number'] ?? '',
      };
    },
  };
}
