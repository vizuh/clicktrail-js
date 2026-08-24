/**
 * Attach Attribution -> 'lead.attribution_attached'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildAttachAttribution } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const attachAttribution = createAction({
  auth: clicktrailAuth,
  name: 'attach_attribution',
  displayName: 'Attach Attribution',
  description: 'Attach attribution context (source / medium / campaign) to a ClickTrail visitor.',
  props: {
    visitorId: Property.ShortText({
      displayName: 'Visitor ID',
      required: false,
    }),
    source: Property.ShortText({
      displayName: 'Source',
      description: 'e.g. google, newsletter.',
      required: false,
    }),
    medium: Property.ShortText({
      displayName: 'Medium',
      description: 'e.g. cpc, email.',
      required: false,
    }),
    campaign: Property.ShortText({
      displayName: 'Campaign',
      required: false,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Attach Attribution',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildAttachAttribution(context.propsValue),
    });
  },
});
