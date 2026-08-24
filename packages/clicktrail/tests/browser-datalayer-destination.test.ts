/**
 * dataLayerDestination: pushes stamped payloads into an injected array,
 * and creates its own array only inside start() — never on import.
 */
import { describe, expect, it } from 'vitest';
import { dataLayerDestination } from '../src/browser/transport.js';
import { buildEventPayload } from '../src/browser/serialize.js';

describe('dataLayerDestination', () => {
  it('pushes events into a provided (injected) array in order', () => {
    const dataLayer: unknown[] = [];
    const dest = dataLayerDestination({ dataLayer });

    const e1 = buildEventPayload({ ft_source: 'google' }, 'page_view');
    const e2 = buildEventPayload({ ft_source: 'google' }, 'lead.submitted');
    dest.deliver(e1);
    dest.deliver(e2);

    expect(dataLayer).toEqual([
      { ...e1, event: 'page_view' },
      { ...e2, event: 'lead.submitted' },
    ]);
  });

  it('creates its backing array only when started (lazy, never at import)', () => {
    const dest = dataLayerDestination();
    expect(dest.getArray()).toEqual([]);

    dest.start?.();
    dest.deliver(buildEventPayload({}, 'page_view'));
    expect(dest.getArray()).toHaveLength(1);
    expect((dest.getArray()[0] as Record<string, unknown>)['event']).toBe('page_view');
  });
});
