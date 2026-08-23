/**
 * AUTH LAW tests: Authorization header comes only from the injected token
 * provider, and no secret material ever appears in serialized payloads
 * (negative test greps every wire body for a planted canary secret).
 */
import { describe, expect, it } from 'vitest';
import { createApointooDestination } from '../src/apointoo/destination.js';
import { buildOutcomeEvent } from '../src/apointoo/outcome.js';
import { EVENT_SALE_COMPLETED } from '../src/conventions/stable.js';

const CANARY_SECRET = 'canary-long-lived-apointoo-api-key-DO-NOT-LEAK';

function captureFetch() {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const fetchFn = async (
    _endpoint: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ headers: init.headers, body: init.body });
    return { ok: true, status: 200 };
  };
  return Object.assign(fetchFn, { calls });
}

describe('auth header handling', () => {
  it('attaches Authorization: Bearer from the injected token provider', async () => {
    const fetchFn = captureFetch();
    let minted = 0;
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 1,
      fetch: fetchFn,
      getToken: () => {
        minted++;
        return `short-lived-token-${minted}`;
      },
    });
    dest.deliver(buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: 'j1' }));
    await dest.flush?.();

    expect(fetchFn.calls[0]!.headers['authorization']).toBe('Bearer short-lived-token-1');
  });

  it('omits the Authorization header entirely without a token provider', async () => {
    const fetchFn = captureFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 1,
      fetch: fetchFn,
    });
    dest.deliver(buildOutcomeEvent(EVENT_SALE_COMPLETED, { journeyId: 'j1' }));
    await dest.flush?.();
    expect('authorization' in fetchFn.calls[0]!.headers).toBe(false);
  });

  it('merges sign() headers but never injects secrets by default', async () => {
    const fetchFn = captureFetch();
    const dest = createApointooDestination({
      endpoint: 'https://apointoo.example/outcomes',
      batchSize: 1,
      fetch: fetchFn,
      sign: (body) => ({ 'x-signature': `sig(${body.length})` }),
      // AUTH LAW negative control: even if a host wires a bad provider that
      // returns a long-lived key, the module must not echo it into payloads —
      // the token goes ONLY into the header, never the body.
      getToken: () => CANARY_SECRET,
    });
    dest.deliver(
      buildOutcomeEvent(
        EVENT_SALE_COMPLETED,
        { journeyId: 'j1', value: 10, currency: 'EUR' },
        { ft_source: 'google', gclid: 'g1' },
      ),
    );
    await dest.flush?.();

    expect(fetchFn.calls[0]!.headers['x-signature']).toBeTypeOf('string');
    for (const call of fetchFn.calls) {
      // Negative grep: the canary secret must NEVER appear in any body.
      expect(call.body.includes(CANARY_SECRET)).toBe(false);
      const parsed = JSON.parse(call.body) as unknown;
      expect(JSON.stringify(parsed).includes(CANARY_SECRET)).toBe(false);
    }
  });

});
