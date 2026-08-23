/**
 * PRIVACY LAW: captureContent defaults to FALSE (metadata only). Enabling
 * it requires a redact fn at construction (factory throws otherwise);
 * captured content ALWAYS passes through redact() before inclusion.
 */
import { describe, expect, it } from 'vitest';
import { createConversationTracker } from '../src/conversation/tracker.js';
import type { ConversationTrackerConfig } from '../src/conversation/tracker.js';
import { fakeAdapter, fakeHost } from './conversation-helpers.js';

const RAW = 'My email is hugo@example.com and card 4111 1111 1111 1111';

function trackerWith(
  opts: Partial<Omit<ConversationTrackerConfig, 'clickTrail'>>,
) {
  const host = fakeHost();
  return { host, tracker: createConversationTracker({ clickTrail: host, ...opts }) };
}

describe('conversation content guard', () => {
  it('throws at construction when captureContent=true without a redact fn', () => {
    expect(() => createConversationTracker({ clickTrail: fakeHost(), captureContent: true }))
      .toThrow(/redact/);
  });

  it('defaults to metadata-only: content passed by the caller is DROPPED', () => {
    const { host, tracker } = trackerWith({});
    tracker.conversationStarted({ conversationId: 'cw-1', content: RAW });
    expect(host.events[0]!.data['content']).toBeUndefined();
    // raw text must not leak under any other key either
    expect(JSON.stringify(host.events)).not.toContain('hugo@example.com');
  });

  it('explicit captureContent=false also drops content', () => {
    const { host, tracker } = trackerWith({ captureContent: false });
    tracker.conversationStarted({ conversationId: 'cw-1', content: RAW });
    expect(host.events[0]!.data['content']).toBeUndefined();
  });

  it('applies the redact fn when capture is enabled; raw never appears', () => {
    const { host, tracker } = trackerWith({
      captureContent: true,
      redact: (c) => c.replace(/[0-9]/g, '*').split(' ').slice(0, 2).join(' '),
    });
    tracker.conversationStarted({ conversationId: 'cw-1', content: RAW });
    expect(host.events[0]!.data['content']).not.toBe(RAW);
    expect(typeof host.events[0]!.data['content']).toBe('string');
    expect(JSON.stringify(host.events)).not.toContain('hugo@example.com');
    expect(JSON.stringify(host.events)).not.toContain('4111');
  });

  it('redact fn runs even for empty-ish content paths consistently (no raw passthrough)', () => {
    const { host, tracker } = trackerWith({
      captureContent: true,
      redact: () => '[redacted]',
    });
    tracker.qualifyLead({ conversationId: 'cw-2', content: RAW });
    expect(host.events[0]!.data['content']).toBe('[redacted]');
  });
});
