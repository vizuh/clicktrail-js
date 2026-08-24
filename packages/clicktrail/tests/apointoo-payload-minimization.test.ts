/**
 * Payload minimization through the destination: unknown keys stripped,
 * enrichment via the injected getJourneyContext() seam fills gaps only.
 */
import { describe, expect, it } from 'vitest';
import { createApointooDestination } from '../src/apointoo/destination.js';
import {
  OUTCOME_ALLOWED_KEYS,
  WIRE_JOURNEY_ID,
  buildOutcomeEvent,
} from '../src/apointoo/outcome.js';
import { EVENT_APPOINTMENT_BOOKED, EVENT_PAGE_VIEW } from '@vizuh/clicktrail-core';

/**
 * Upstream hosts may hand the destination raw records (not yet stamped
 * ClickTrailEvents) — the destination minimizes whatever it receives.
 */
function deliverRaw(
  dest: { deliver(event: Record<string, unknown>): void },
  event: Record<string, unknown>,
): void {
  dest.deliver(event);
}

function captureFetch() {
  const bodies: Record<string, unknown>[][] = [];
  const fetchFn = async (
    _endpoint: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    const parsed = JSON.parse(init.body) as { events: Record<string, unknown>[] };
    bodies.push(parsed.events);
    return { ok: true, status: 200 };
  };
  return Object.assign(fetchFn, { bodies });
}

describe('destination payload minimization', () => {
  it('strips unknown keys attached by upstream code before sending', async () => {
    const fetchFn = captureFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 1,
      fetch: fetchFn,
      getJourneyContext: () => ({ ft_source: 'google', gclid: 'g-1' }),
    });
    deliverRaw(dest, {
      event_name: EVENT_APPOINTMENT_BOOKED,
      [WIRE_JOURNEY_ID]: 'j9',
      email: 'victim@example.com',
      credit_card: '4111',
      sessionStorageDump: { a: 1 },
    });
    await dest.flush?.();

    const sent = fetchFn.bodies[0]![0]!;
    expect(sent[WIRE_JOURNEY_ID]).toBe('j9');
    expect(sent['ft_source']).toBe('google');
    for (const key of Object.keys(sent)) {
      expect(OUTCOME_ALLOWED_KEYS.concat(['event_name', WIRE_JOURNEY_ID, 'outcome.id', 'value', 'currency', 'schema_version', 'classifier_version'])).toContain(key);
    }
    expect('email' in sent).toBe(false);
    expect('credit_card' in sent).toBe(false);
    expect('sessionStorageDump' in sent).toBe(false);
  });

  it('enriches outcomes with captured attribution context; explicit fields win', async () => {
    const fetchFn = captureFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 2,
      fetch: fetchFn,
      getJourneyContext: () => ({
        ft_source: 'bing',
        gclid: 'ctx-g',
        currency: 'EUR',
        visitor_id: 'v1',
      }),
    });
    dest.deliver(
      buildOutcomeEvent(EVENT_APPOINTMENT_BOOKED, {
        journeyId: 'j1',
        value: 50,
        currency: 'BRL',
      }),
    );
    // An event with NO journey id from any source cannot be correlated and
    // is skipped (fail-closed), not sent with a fabricated id.
    deliverRaw(dest, { event_name: EVENT_APPOINTMENT_BOOKED });
    await dest.flush?.();

    const first = fetchFn.bodies[0]![0]!;
    expect(first[WIRE_JOURNEY_ID]).toBe('j1');
    expect(first['currency']).toBe('BRL'); // explicit wins over ctx
    expect(first['ft_source']).toBe('bing');
    expect(first['gclid']).toBe('ctx-g');

    expect(fetchFn.bodies[0]).toHaveLength(1); // uncorrelatable event dropped
  });

  it('ignores non-outcome events by design', async () => {
    const fetchFn = captureFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 1,
      fetch: fetchFn,
    });
    deliverRaw(dest, {
      event_name: EVENT_PAGE_VIEW,
      [WIRE_JOURNEY_ID]: 'j1',
    });
    await dest.flush?.();
    expect(fetchFn.bodies).toHaveLength(0);
  });
});
