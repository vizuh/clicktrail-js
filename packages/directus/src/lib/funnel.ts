/**
 * Pure funnel aggregation for the Campaign -> Lead -> Sale panel.
 *
 * The Vue component stays dumb: it hands stored clicktrail_events rows to
 * {@link aggregateFunnel} and renders the returned summary. All counting,
 * guarding, and sorting lives here so it is unit-testable without a DOM.
 */

/** Row shape of the locally stored clicktrail events collection. */
export interface StoredClickTrailEventRow {
  event_name?: unknown;
  campaign?: unknown;
  lead_id?: unknown;
  occurred_at?: unknown;
  [key: string]: unknown;
}

export interface CampaignFunnelRow {
  campaign: string;
  leads: number;
  qualified: number;
  sales: number;
}

export interface FunnelSummary {
  leads: number;
  qualified: number;
  sales: number;
  byCampaign: CampaignFunnelRow[];
}

const LEAD_EVENT_NAMES = ['lead', 'lead.attribution_attached'] as const;
const QUALIFIED_EVENT_NAME = 'lead.qualified';
const SALE_EVENT_NAME = 'sale.recorded';
const DIRECT_LABEL = '(direct)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function campaignOf(row: Record<string, unknown>): string {
  const raw = typeof row['campaign'] === 'string' ? row['campaign'].trim() : '';
  return raw === '' ? DIRECT_LABEL : raw;
}

interface StageCounts { leads: number; qualified: number; sales: number }

function emptyCounts(): StageCounts {
  return { leads: 0, qualified: 0, sales: 0 };
}

/**
 * Aggregate stored events into a three-stage funnel summary.
 *
 * Contract:
 * - null/undefined/non-array input behaves like an empty list.
 * - Rows missing event_name or carrying unknown event names are ignored.
 * - 'lead' AND 'lead.attribution_attached' both count as a lead; only
 *   'lead.qualified' counts as qualified; only 'sale.recorded' counts as a
 *   sale. Other contract events never inflate stages.
 * - Missing/empty campaign falls back to '(direct)' so unattributed volume
 *   still appears in byCampaign instead of disappearing.
 * - byCampaign is sorted by leads desc, then campaign asc (stable ties).
 */
export function aggregateFunnel(
  events: readonly unknown[] | null | undefined,
): FunnelSummary {
  const totals = emptyCounts();
  const perCampaign = new Map<string, StageCounts>();

  if (!Array.isArray(events)) {
    return { leads: 0, qualified: 0, sales: 0, byCampaign: [] };
  }

  for (const entry of events) {
    if (!isRecord(entry)) continue;
    const name = typeof entry['event_name'] === 'string' ? entry['event_name'] : '';
    let stage: keyof StageCounts | null = null;
    if ((LEAD_EVENT_NAMES as readonly string[]).includes(name)) stage = 'leads';
    else if (name === QUALIFIED_EVENT_NAME) stage = 'qualified';
    else if (name === SALE_EVENT_NAME) stage = 'sales';
    else continue;

    const campaign = campaignOf(entry);
    totals[stage] += 1;

    let bucket = perCampaign.get(campaign);
    if (bucket === undefined) {
      bucket = emptyCounts();
      perCampaign.set(campaign, bucket);
    }
    bucket[stage] += 1;
  }

  const byCampaign = Array.from(perCampaign.entries())
    .map(([campaign, counts]) => ({ campaign, ...counts }))
    .sort((a, b) => b.leads - a.leads || a.campaign.localeCompare(b.campaign));

  return { leads: totals.leads, qualified: totals.qualified, sales: totals.sales, byCampaign };
}
