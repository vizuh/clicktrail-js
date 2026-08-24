/**
 * Identify Lead -> 'lead'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildIdentifyLead } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const identifyLead = createAction({
  auth: clicktrailAuth,
  name: 'identify_lead',
  displayName: 'Identify Lead',
  description: 'Record a lead in ClickTrail with visitor identity details.',
  props: {
    visitorId: Property.ShortText({
      displayName: 'Visitor ID',
      description: 'ClickTrail visitor ID to attach identity to.',
      required: false,
    }),
    email: Property.ShortText({
      displayName: 'Email',
      required: false,
    }),
    leadId: Property.ShortText({
      displayName: 'Lead ID',
      description: 'Your system\'s lead identifier.',
      required: false,
    }),
    name: Property.ShortText({
      displayName: 'Name',
      required: false,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Identify Lead',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildIdentifyLead(context.propsValue),
    });
  },
});
