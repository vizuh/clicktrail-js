import { describe, expect, it } from 'vitest';
import { aggregateFunnel } from '../src/lib/funnel.js';

function row(event_name: string, campaign?: string) {
  return {
    event_name,
    ...(campaign !== undefined ? { campaign } : {}),
    lead_id: 'lead_1',
    occurred_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('aggregateFunnel', () => {
  it('returns an all-zero summary for empty/null/undefined input', () => {
    const empty = { leads: 0, qualified: 0, sales: 0, byCampaign: [] };
    expect(aggregateFunnel([])).toEqual(empty);
    expect(aggregateFunnel(null)).toEqual(empty);
    expect(aggregateFunnel(undefined)).toEqual(empty);
  });

  it('counts the three stages from stored rows', () => {
    const summary = aggregateFunnel([
      row('lead'),
      row('lead.attribution_attached', 'spring'),
      row('lead.qualified'),
      row('sale.recorded'),
    ]);
    expect(summary.leads).toBe(2);
    expect(summary.qualified).toBe(1);
    expect(summary.sales).toBe(1);
  });

  it('ignores unknown event names and malformed rows', () => {
    const summary = aggregateFunnel([
      row('consent.granted'),
      row('refund.issued'),
      { campaign: 'no-name' },
      'not-an-object',
      null,
    ]);
    expect(summary).toEqual({ leads: 0, qualified: 0, sales: 0, byCampaign: [] });
  });

  it('falls back to (direct) when campaign is missing or blank', () => {
    const summary = aggregateFunnel([row('lead'), row('lead'), { event_name: 'sale.recorded', campaign: '   ' }]);
    expect(summary.byCampaign.map((c) => c.campaign)).toEqual(['(direct)']);
    expect(summary.byCampaign[0]?.leads).toBe(2);
    expect(summary.byCampaign[0]?.sales).toBe(1);
  });

  it('sorts multi-campaign output by leads desc then campaign asc', () => {
    const summary = aggregateFunnel([
      ...Array.from({ length: 3 }, () => row('lead', 'zeta')),
      ...Array.from({ length: 3 }, () => row('lead', 'alpha')),
      row('lead', 'beta'),
      row('lead.qualified', 'alpha'),
      row('sale.recorded', 'alpha'),
    ]);
    expect(summary.byCampaign.map((c) => [c.campaign, c.leads])).toEqual([
      ['alpha', 3],
      ['zeta', 3],
      ['beta', 1],
    ]);
    expect(summary.byCampaign[0]).toEqual({ campaign: 'alpha', leads: 3, qualified: 1, sales: 1 });
  });

  it('handles missing stages gracefully inside a campaign', () => {
    const summary = aggregateFunnel([row('sale.recorded', 'solo')]);
    expect(summary.byCampaign[0]).toEqual({ campaign: 'solo', leads: 0, qualified: 0, sales: 1 });
    expect(summary.leads).toBe(0);
  });

  it('does not mutate the input array', () => {
    const events = [row('lead', 'a'), row('sale.recorded')];
    const snapshot = JSON.parse(JSON.stringify(events));
    aggregateFunnel(events);
    expect(events).toEqual(snapshot);
  });
});
