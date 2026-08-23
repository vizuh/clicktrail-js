export { parseAttributionUrl, readQuery, referrerHostOf } from './parse.js';
export { mergeAttributionTouch, extractClickIds, emptyAttribution, stampVersions } from './merge.js';
export { sanitizeField, normalizeHost, hostMatches } from './sanitize.js';
export { DIAGNOSTIC_CODES, nullDiagnosticSink } from './diagnostics.js';
export type { Diagnostic, DiagnosticLevel, DiagnosticSink } from './diagnostics.js';
export type { AttributionPayload, AttributionTouch, ParseAttributionInput, ParseResult, ParsedTouch } from './types.js';
