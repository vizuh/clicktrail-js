/**
 * Record Refund -> 'refund'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildRecordRefund } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const recordRefund = createAction({
  auth: clicktrailAuth,
  name: 'record_refund',
  displayName: 'Record Refund',
  description: 'Record a refund against an existing ClickTrail sale transaction.',
  props: {
    originalTransactionId: Property.ShortText({
      displayName: 'Original Transaction ID',
      description: 'Transaction ID of the sale being refunded.',
      required: true,
    }),
    value: Property.Number({
      displayName: 'Refund Value',
      description: 'Positive refunded amount. Omit for a full refund of the original transaction.',
      required: false,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Record Refund',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildRecordRefund(context.propsValue),
    });
  },
});
