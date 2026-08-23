/**
 * Tool-call summary validation (`/agent`).
 *
 * PRIVACY LAW (mirrored from /conversation, fail-closed): a tool-call
 * summary is METADATA ONLY - exactly { tool, ok, durationMs } plus an
 * optional { error_code }. validateToolCall REJECTS any object carrying
 * extra keys, so prompt/completion content can never ride in through a
 * "just one more field" addition. Nested objects are impossible by
 * construction: every allowed key must hold a primitive of an exact type,
 * and unknown keys throw before anything is stored or emitted.
 */

/** Allowed tool-call summary shape. Nothing else may ever appear. */
export interface ToolCallSummary {
  /** Tool identifier (e.g. 'search', 'crm.write'). Metadata, never content. */
  tool: string;
  /** Whether the call succeeded. */
  ok: boolean;
  /** CALLER-measured wall time in milliseconds. Never timer-derived here. */
  durationMs: number;
  /** Stable error code when ok === false. Codes only - never messages. */
  error_code?: string;
}

/** Exact key allowlist for a tool-call summary object. */
export const TOOL_CALL_KEYS = ['tool', 'ok', 'durationMs', 'error_code'] as const;

function fail(why: string): never {
  throw new Error(
    'clicktrail/agent: rejected tool call (' + why + '). Only ' +
      '{ tool, ok, durationMs, error_code? } metadata is accepted; ' +
      'prompt or completion content is never recorded.',
  );
}

/**
 * Validate one tool-call summary. Throws on extra keys, missing keys,
 * wrong types, and non-plain inputs - fail-closed against content leakage.
 */
export function validateToolCall(raw: unknown): ToolCallSummary {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('not a plain object');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!(TOOL_CALL_KEYS as readonly string[]).includes(key)) {
      fail('unexpected key "' + key + '"');
    }
  }
  const { tool, ok, durationMs } = obj;
  if (typeof tool !== 'string' || tool === '') fail('"tool" must be a non-empty string');
  if (typeof ok !== 'boolean') fail('"ok" must be a boolean');
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    fail('"durationMs" must be a finite non-negative number');
  }
  const out: ToolCallSummary = { tool, ok, durationMs };
  const errorCode = obj['error_code'];
  if (errorCode !== undefined) {
    if (typeof errorCode !== 'string' || errorCode === '') {
      fail('"error_code" must be a non-empty string when present');
    }
    out.error_code = errorCode;
  }
  return out;
}

/**
 * Validate a batch; returns fresh summaries. Throws on the FIRST bad
 * entry, so a poisoned batch never partially lands.
 */
export function validateToolCalls(raw: readonly unknown[]): ToolCallSummary[] {
  return raw.map((entry) => validateToolCall(entry));
}
