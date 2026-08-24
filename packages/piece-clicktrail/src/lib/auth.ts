/**
 * ClickTrail connection for Activepieces.
 *
 * Validation is intentionally field-shape-only (non-empty apiKey + siteId).
 * There is NO read/verify endpoint on the ClickTrail collector yet, so a
 * "test connection" ping would mean sending a fake tracking event — worse
 * than trusting the author's fields. First real send surfaces any bad
 * credential as an ActionError on the action itself.
 */
import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { DEFAULT_BASE_URL } from './client.js';

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export const clicktrailAuth = PieceAuth.CustomAuth({
  description: `Connect your ClickTrail site. Get the API key and Site ID from your ClickTrail dashboard. Base URL defaults to ${DEFAULT_BASE_URL} (override for self-hosted).`,
  required: true,
  props: {
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      description: `ClickTrail events collector URL. Leave empty to use the default (${DEFAULT_BASE_URL}). Override for self-hosted ClickTrail.`,
      required: false,
      defaultValue: DEFAULT_BASE_URL,
    }),
    apiKey: Property.ShortText({
      displayName: 'API Key',
      description: 'ClickTrail ingest API key, sent as the X-ClickTrail-Key header.',
      required: true,
    }),
    siteId: Property.ShortText({
      displayName: 'Site ID',
      description: 'ClickTrail site these events belong to.',
      required: true,
    }),
    workspaceId: Property.ShortText({
      displayName: 'Workspace ID',
      description: 'Optional ClickTrail workspace ID stamped into the marketing_trail envelope.',
      required: false,
    }),
  },
  async validate({ auth }) {
    const fields = auth as Record<string, unknown>;
    const valid = isNonEmpty(fields['apiKey']) && isNonEmpty(fields['siteId']);
    return valid ? { valid: true } : { valid: false, error: 'API Key and Site ID are required.' };
  },
});
