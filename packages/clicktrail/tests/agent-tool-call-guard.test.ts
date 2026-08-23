/**
 * PRIVACY LAW (/agent mirror of /conversation): tool-call summaries are
 * metadata only. validateToolCall accepts exactly { tool, ok, durationMs,
 * error_code? } and REJECTS extra keys - fail-closed against prompt or
 * completion content riding in through "just one more field".
 */
import { describe, expect, it } from 'vitest';
import {
  TOOL_CALL_KEYS,
  validateToolCall,
  validateToolCalls,
} from '../src/agent/tool-call.js';

const VALID = { tool: 'search', ok: true, durationMs: 100 };

describe('tool-call fail-closed guard', () => {
  it('accepts the exact minimal shape and preserves valid error_code', () => {
    expect(validateToolCall(VALID)).toEqual({ tool: 'search', ok: true, durationMs: 100 });
    expect(validateToolCall({ ...VALID, ok: false, error_code: 'E_TIMEOUT' })).toEqual({
      tool: 'search',
      ok: false,
      durationMs: 100,
      error_code: 'E_TIMEOUT',
    });
  });

  it('rejects extra scalar keys (the classic "one more field")', () => {
    expect(() => validateToolCall({ ...VALID, output: 'the answer was 42' })).toThrow(/unexpected key "output"/);
    expect(() => validateToolCall({ ...VALID, result: { text: 'draft reply...' } })).toThrow(/unexpected key "result"/);
    expect(() => validateToolCall({ ...VALID, prompt: 'summarize this inbox' })).toThrow(/unexpected key "prompt"/);
  });

  it('rejects sneaky nested payload carriers regardless of key name', () => {
    const sneaky = [
      { ...VALID, meta: { prompt: 'leak' } },
      { ...VALID, context: { messages: [{ role: 'user', content: 'my email is x@y.z' }] } },
      { ...VALID, data: { completion: '...' } },
      { ...VALID, response: 'full raw response text' },
    ];
    for (const entry of sneaky) {
      expect(() => validateToolCall(entry)).toThrow(/unexpected key/);
    }
  });

  it('never lets raw rejected content appear in the thrown message', () => {
    const secret = 'card 4111 1111 1111 1111';
    try {
      validateToolCall({ ...VALID, notes: secret });
      throw new Error('expected rejection');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/rejected tool call/);
      expect(message).not.toContain(secret);
      expect(message).not.toContain('4111');
    }
  });

  it('rejects wrong types and non-plain inputs', () => {
    expect(() => validateToolCall(null)).toThrow();
    expect(() => validateToolCall(undefined)).toThrow();
    expect(() => validateToolCall([VALID])).toThrow();
    expect(() => validateToolCall('search')).toThrow();
    expect(() => validateToolCall({ ...VALID, tool: '' })).toThrow(/"tool"/);
    expect(() => validateToolCall({ ...VALID, ok: 'yes' })).toThrow(/"ok"/);
    expect(() => validateToolCall({ ...VALID, durationMs: -1 })).toThrow(/"durationMs"/);
    expect(() => validateToolCall({ ...VALID, durationMs: Number.NaN })).toThrow();
    expect(() => validateToolCall({ ...VALID, error_code: '' })).toThrow(/"error_code"/);
    expect(() => validateToolCall({ ...VALID, error_code: 42 })).toThrow(/"error_code"/);
    // missing keys
    expect(() => validateToolCall({ tool: 't', ok: true })).toThrow();
  });

  it('validateToolCalls fails on the FIRST bad entry without partial landing', () => {
    expect(() => validateToolCalls([VALID, { ...VALID, completion: 'leak' }, VALID])).toThrow(
      /unexpected key "completion"/,
    );
  });

  it('allowlist constant stays exactly four keys', () => {
    expect([...TOOL_CALL_KEYS].sort()).toEqual(['durationMs', 'error_code', 'ok', 'tool']);
  });
});
