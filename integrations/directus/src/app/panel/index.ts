/**
 * P2 — Dashboard panel "Campaign -> Lead -> Sale".
 *
 * App-side piece, hand-rolled: a Vue component built with defineComponent +
 * h() render functions only (no .vue SFCs, no vue-loader), bundled by
 * esbuild into dist/panel/index.js exporting createPanel({...}).
 *
 * The host component (PanelView) fetches stored clicktrail_events rows from
 * the Directus API and hands them to the dumb FunnelBars component, which
 * delegates ALL aggregation to the pure aggregateFunnel() in lib/funnel.ts.
 */
import { defineComponent, h, ref, type PropType } from 'vue';
import { aggregateFunnel } from '../../lib/funnel.js';
import type { CampaignFunnelRow, FunnelSummary } from '../../lib/funnel.js';
import { TOKENS } from '../tokens.js';

const PANEL_ID = 'clicktrail-funnel';

/** Dumb renderer: summary in, markup out. No fetching, no state. */
export const FunnelBars = defineComponent({
  name: 'ClickTrailFunnelBars',
  props: {
    summary: { type: Object as PropType<FunnelSummary>, required: true },
  },
  setup(props) {
    return () => {
      const stages = [
        { label: 'Leads', value: props.summary.leads, color: TOKENS.accent },
        { label: 'Qualified', value: props.summary.qualified, color: TOKENS.accentSoft },
        { label: 'Sales', value: props.summary.sales, color: '#72aee6' },
      ];
      const maxStage = Math.max(1, ...stages.map((s) => s.value));

      const stageNodes = stages.map((stage) =>
        h('div', { key: stage.label, style: 'margin-bottom:10px;' }, [
          h(
            'div',
            {
              style: `display:flex;justify-content:space-between;color:${TOKENS.muted};font-size:12px;margin-bottom:3px;`,
            },
            [h('span', [stage.label]), h('strong', { style: `color:${TOKENS.ink}` }, [String(stage.value)])],
          ),
          h('div', { style: `background:${TOKENS.panelSoft};border-radius:${TOKENS.radius};height:14px;` }, [
            h('div', {
              key: `${stage.label}-bar`,
              style: `width:${(stage.value / maxStage) * 100}%;background:${stage.color};border-radius:${TOKENS.radius};height:100%;min-width:${stage.value > 0 ? '6px' : '0'};transition:width .25s;`,
            }),
          ]),
        ]),
      );

      const campaignRows: CampaignFunnelRow[] = props.summary.byCampaign.slice(0, 8);
      const campaignNodes =
        campaignRows.length === 0
          ? []
          : [
              h(
                'div',
                { style: `color:${TOKENS.muted};font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px;` },
                ['By campaign'],
              ),
              ...campaignRows.map((row) =>
                h(
                  'div',
                  {
                    key: row.campaign,
                    style: `display:flex;justify-content:space-between;padding:5px 8px;border-radius:8px;background:${TOKENS.panelSoft};margin-bottom:4px;font-size:12px;`,
                  },
                  [
                    h('span', { style: `color:${TOKENS.ink}` }, [row.campaign]),
                    h('span', { style: `color:${TOKENS.muted}` }, [
                      `${row.leads} → ${row.qualified} → ${row.sales}`,
                    ]),
                  ],
                ),
              ),
            ];

      return h(
        'div',
        {
          class: 'ct-funnel-panel',
          style: `background:${TOKENS.panel};color:${TOKENS.ink};padding:14px;border-radius:${TOKENS.radius};height:100%;overflow:auto;font-family:'Noto Sans',system-ui,sans-serif;`,
        },
        [...stageNodes, ...campaignNodes],
      );
    };
  },
});

/** Host component: fetches rows, aggregates, renders FunnelBars. */
export const PanelView = defineComponent({
  name: 'ClickTrailFunnelView',
  setup() {
    const events = ref<unknown[] | null>(null);
    const error = ref('');
    void (async () => {
      try {
        const response = await fetch(
          '/items/clicktrail_events?fields=event_name,campaign,lead_id,occurred_at&limit=-1',
          { credentials: 'include' },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { data?: unknown };
        events.value = Array.isArray(body?.data) ? body.data : [];
      } catch (err) {
        error.value = String(err);
      }
    })();

    return () => {
      if (error.value !== '') {
        return h(
          'div',
          { style: `padding:14px;color:${TOKENS.muted};font-size:12px;background:${TOKENS.panel};border-radius:${TOKENS.radius};` },
          [`ClickTrail panel could not load events (${error.value}).`],
        );
      }
      if (events.value === null) {
        return h(
          'div',
          { style: `padding:14px;color:${TOKENS.muted};font-size:12px;` },
          ['Loading ClickTrail funnel…'],
        );
      }
      return h(FunnelBars, { summary: aggregateFunnel(events.value) });
    };
  },
});

export interface PanelManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  minWidth: number;
  minHeight: number;
  component: typeof PanelView;
}

/** Directus app-side panel manifest. */
export function createPanel(): PanelManifest {
  return {
    id: PANEL_ID,
    name: 'Campaign → Lead → Sale',
    description:
      'Three-stage attribution funnel over locally stored ClickTrail events: leads, qualified leads, and recorded sales per campaign.',
    icon: 'funnel',
    minWidth: 20,
    minHeight: 14,
    component: PanelView,
  };
}

export default createPanel();
