/**
 * Record Booking -> 'booking'.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildRecordBooking } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const recordBooking = createAction({
  auth: clicktrailAuth,
  name: 'record_booking',
  displayName: 'Record Booking',
  description: 'Record a booking (appointment, reservation, stay) in ClickTrail.',
  props: {
    value: Property.Number({
      displayName: 'Value',
      description: 'Positive booking value.',
      required: false,
    }),
    currency: Property.ShortText({
      displayName: 'Currency',
      description: 'ISO 4217 code, e.g. EUR, USD.',
      required: false,
    }),
    startDate: Property.ShortText({
      displayName: 'Start Date',
      description: 'Booking start date (ISO 8601).',
      required: false,
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Record Booking',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildRecordBooking(context.propsValue),
    });
  },
});
