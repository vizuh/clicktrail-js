/**
 * Record Sale -> 'sale.recorded'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildRecordSale } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const recordSale = createAction({
  auth: clicktrailAuth,
  name: 'record_sale',
  displayName: 'Record Sale',
  description: 'Record a completed sale in ClickTrail with transaction id, value, and currency.',
  props: {
    transactionId: Property.ShortText({
      displayName: 'Transaction ID',
      required: true,
    }),
    value: Property.Number({
      displayName: 'Value',
      description: 'Positive sale value.',
      required: true,
    }),
    currency: Property.ShortText({
      displayName: 'Currency',
      description: 'ISO 4217 code, e.g. EUR, USD.',
      required: true,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Record Sale',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildRecordSale(context.propsValue),
    });
  },
});
