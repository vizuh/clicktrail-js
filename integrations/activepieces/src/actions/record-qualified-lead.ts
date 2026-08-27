/**
 * Record Qualified Lead -> 'lead_qualified'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildQualifiedLead } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const recordQualifiedLead = createAction({
  auth: clicktrailAuth,
  name: 'record_qualified_lead',
  displayName: 'Record Qualified Lead',
  description: 'Mark a lead as qualified in ClickTrail. Attribution to the original trail is handled by the SDK.',
  props: {
    leadId: Property.ShortText({
      displayName: 'Lead ID',
      description: 'The ClickTrail lead identifier being qualified.',
      required: true,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Record Qualified Lead',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildQualifiedLead(context.propsValue),
    });
  },
});
