/**
 * Update Consent -> canonical `consent_updated` + `consent_state`.
 *
 * Legacy dropdown values remain accepted for saved flows; granted/withdrawn
 * also fold analytics/advertising flags into the marketing_trail envelope.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import {
  CONSENT_EVENT_NAMES,
  buildUpdateConsent,
} from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const updateConsent = createAction({
  auth: clicktrailAuth,
  name: 'update_consent',
  displayName: 'Update Consent',
  description: 'Update a visitor\'s consent state in ClickTrail (granted, withdrawn, or policy update acknowledged).',
  props: {
    state: Property.StaticDropdown({
      displayName: 'Consent State',
      description: 'Recorded as consent_state on the consent_updated event.',
      required: true,
      options: {
        disabled: false,
        options: [
          { label: 'Consent granted', value: CONSENT_EVENT_NAMES[0] },
          { label: 'Consent withdrawn', value: CONSENT_EVENT_NAMES[1] },
          { label: 'Consent policy updated', value: CONSENT_EVENT_NAMES[2] },
        ],
      },
    }),
    source: Property.ShortText({
      displayName: 'Source',
      description: 'Where the consent signal came from, e.g. cookie-banner, preference-center.',
      required: false,
    }),
    policyVersion: Property.ShortText({
      displayName: 'Policy Version',
      description: 'Version of the privacy policy acknowledged, e.g. 2026-01.',
      required: false,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Update Consent',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildUpdateConsent(context.propsValue),
    });
  },
});
