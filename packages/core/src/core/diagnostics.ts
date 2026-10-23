/**
 * Diagnostics contract (interfaces only in Phase 1a).
 *
 * Product lanes queued for Phase 1b+:
 * - leveled reporting (`silent | warn`), default silent
 * - consent flaw detection (capture attempted while consent denied)
 * - missing-signal hints (landing without attribution, click ID w/o UTMs)
 */

/** Severity levels for diagnostic reporters. */
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single structured diagnostic. No free-text-only entries; code first. */
export interface Diagnostic {
  /** Stable machine code, e.g. 'click_id_without_utm'. */
  code: string;
  level: DiagnosticLevel;
  message: string;
  /** Redacted-by-default context. Never include raw PII here. */
  context?: Record<string, string | number | boolean>;
}

/** Where diagnostics go. Host apps wire this; core never touches console directly. */
export interface DiagnosticSink {
  report(diagnostic: Diagnostic): void;
}

/** Built-in codes so producers and consumers agree on vocabulary. */
export const DIAGNOSTIC_CODES = {
  CLICK_ID_WITHOUT_UTM: 'click_id_without_utm',
  NO_SIGNAL_LANDING: 'no_signal_landing',
  INTERNAL_REFERRER_IGNORED: 'internal_referrer_ignored',
  /** Referrer matched `ignoredReferrerHosts` (e.g. a payment return) and was blanked. */
  IGNORED_REFERRER_HOST: 'ignored_referrer_host',
  CONSENT_DENIED_CAPTURE_ATTEMPTED: 'consent_denied_capture_attempted',
  FIELD_TRUNCATED: 'field_truncated',
  /** Unpinned GA session read while several `_ga_<property>` cookies exist. */
  GA_SESSION_PROPERTY_UNPINNED: 'ga_session_property_unpinned',
} as const;

/** A sink that discards everything — the default. Deterministic and silent. */
export const nullDiagnosticSink: DiagnosticSink = { report: () => {} };
