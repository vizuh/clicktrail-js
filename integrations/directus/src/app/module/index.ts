/**
 * P3 — Settings module "ClickTrail Settings".
 *
 * App-side piece, hand-rolled like the panel: defineComponent + h() only.
 * The form holds local state, validates through the pure validateSettings()
 * in lib/settings.ts, and EMITS `save` with the normalized settings — the
 * HOST performs the actual Directus API persistence (see README.md, the
 * save wiring is intentionally outside the bundle).
 */
import { defineComponent, h, ref } from 'vue';
import { validateSettings } from '../../lib/settings.js';
import type { ClickTrailSettings } from '../../lib/settings.js';
import { TOKENS } from '../tokens.js';

const MODULE_ID = 'clicktrail-settings';

const fieldStyle = `width:100%;padding:8px 10px;border:1px solid ${TOKENS.line};border-radius:8px;background:${TOKENS.canvasDeep};color:${TOKENS.ink};font-size:13px;box-sizing:border-box;`;
const labelStyle = `display:block;color:${TOKENS.muted};font-size:12px;margin:12px 0 4px;`;

function inputField(
  label: string,
  value: string,
  onInput: (next: string) => void,
  extra: Record<string, unknown> = {},
): ReturnType<typeof h> {
  return h('div', [
    h('label', { style: labelStyle }, [label]),
    h('input', {
      value,
      onInput: (event: Event) => onInput((event.target as HTMLInputElement).value),
      style: fieldStyle,
      ...extra,
    }),
  ]);
}

export const SettingsForm = defineComponent({
  name: 'ClickTrailSettingsForm',
  props: {
    initial: {
      type: Object as () => Partial<ClickTrailSettings>,
      default: () => ({}),
    },
  },
  emits: ['save'],
  setup(props, { emit }) {
    const siteId = ref(props.initial.siteId ?? '');
    const endpoint = ref(props.initial.endpoint ?? '');
    const apiKeyMasked = ref(props.initial.apiKeyMasked ?? '');
    const consentRequired = ref(props.initial.consentRequired ?? false);
    const mappingsText = ref(JSON.stringify(props.initial.fieldMappings ?? {}, null, 2));
    const errors = ref<string[]>([]);
    const savedNote = ref('');

    return () =>
      h(
        'div',
        {
          class: 'ct-settings-module',
          style: `max-width:560px;background:${TOKENS.panel};border-radius:${TOKENS.radius};padding:20px;font-family:'Noto Sans',system-ui,sans-serif;`,
        },
        [
          h('h2', { style: `margin:0 0 2px;font-size:18px;` }, ['ClickTrail Settings']),
          h('p', { style: `margin:0;color:${TOKENS.muted};font-size:12px;` }, [
            'Server-side values are set via environment variables (CLICKTRAIL_SITE_ID, CLICKTRAIL_ENDPOINT, CLICKTRAIL_API_KEY). This form records dashboard-level defaults.',
          ]),
          inputField('Site ID', siteId.value, (v) => (siteId.value = v)),
          inputField('Collector endpoint', endpoint.value, (v) => (endpoint.value = v), {
            placeholder: 'https://collector.example.com/collect',
          }),
          inputField('API key (masked)', apiKeyMasked.value, (v) => (apiKeyMasked.value = v), {
            readonly: true,
          }),
          h('label', { style: `${labelStyle} display:flex;align-items:center;gap:8px;margin-top:14px;` }, [
            h('input', {
              type: 'checkbox',
              checked: consentRequired.value,
              onChange: (event: Event) => (consentRequired.value = (event.target as HTMLInputElement).checked),
            }),
            'Require consent before tracking',
          ]),
          h('div', [
            h('label', { style: labelStyle }, ['Field mappings (JSON object, item field -> canonical key)']),
            h('textarea', {
              value: mappingsText.value,
              rows: 5,
              onInput: (event: Event) => (mappingsText.value = (event.target as HTMLTextAreaElement).value),
              style: `${fieldStyle} font-family:monospace;resize:vertical;`,
            }),
          ]),
          errors.value.length > 0
            ? h(
                'ul',
                { style: `color:${TOKENS.accent};font-size:12px;padding-left:18px;margin:10px 0 0;` },
                errors.value.map((message) => h('li', { key: message }, [message])),
              )
            : null,
          savedNote.value !== ''
            ? h('p', { style: `color:#72aee6;font-size:12px;margin:10px 0 0;` }, [savedNote.value])
            : null,
          h(
            'button',
            {
              style: `margin-top:16px;padding:9px 18px;border:none;border-radius:8px;background:${TOKENS.accent};color:${TOKENS.ink};font-size:13px;cursor:pointer;`,
              onClick: () => {
                savedNote.value = '';
                let fieldMappings: Record<string, string> = {};
                try {
                  const parsed: unknown = JSON.parse(mappingsText.value || '{}');
                  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    fieldMappings = parsed as Record<string, string>;
                  }
                } catch {
                  // validateSettings reports the mapping error below.
                  fieldMappings = null as unknown as Record<string, string>;
                }
                const result = validateSettings({
                  siteId: siteId.value,
                  endpoint: endpoint.value,
                  apiKeyMasked: apiKeyMasked.value,
                  consentRequired: consentRequired.value,
                  fieldMappings,
                });
                if (!result.valid) {
                  errors.value = result.errors;
                  return;
                }
                errors.value = [];
                savedNote.value =
                  'Valid. Emitting save — persistence is handled by the host wiring (see README).';
                emit('save', result.normalized);
              },
            },
            ['Save settings'],
          ),
        ],
      );
  },
});

export interface ModuleRoute {
  path: string;
  component: typeof SettingsForm;
}

export interface ModuleManifest {
  id: string;
  name: string;
  icon: string;
  description: string;
  routes: ModuleRoute[];
}

/** Directus app-side module manifest. */
export function createModule(): ModuleManifest {
  return {
    id: MODULE_ID,
    name: 'ClickTrail Settings',
    icon: 'settings',
    description:
      'Dashboard-level ClickTrail defaults: site ID, collector endpoint, masked API key, consent requirement, and field mappings.',
    routes: [{ path: '', component: SettingsForm }],
  };
}

export default createModule();
