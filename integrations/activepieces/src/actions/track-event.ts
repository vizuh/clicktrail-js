/**
 * Track Event -> free-string event name + arbitrary JSON data.
 */
import { createAction, Property } from '@activepieces/pieces-framework';
import { clicktrailAuth } from '../lib/auth.js';
import { buildTrackEvent } from '../lib/events.js';
import { sendActionEvent } from '../lib/client.js';

export const trackEvent = createAction({
  auth: clicktrailAuth,
  name: 'track_event',
  displayName: 'Track Event',
  description: 'Send a custom ClickTrail event with an event name you choose plus optional JSON data.',
  props: {
    eventName: Property.ShortText({
      displayName: 'Event Name',
      description: 'Free-string event name, e.g. "video.watched" or "form_abandoned".',
      required: true,
    }),
    data: Property.Json({
      displayName: 'Event Data',
      description: 'Optional JSON object merged into the event payload.',
      required: false,
      defaultValue: {},
    }),
  },
  async run(context) {
    return sendActionEvent({
      displayName: 'Track Event',
      apiKey: context.auth.props.apiKey,
      baseUrl: context.auth.props.baseUrl,
      siteId: context.auth.props.siteId,
      workspaceId: context.auth.props.workspaceId,
      result: buildTrackEvent({
        eventName: context.propsValue.eventName,
        data: context.propsValue.data,
      }),
    });
  },
});
