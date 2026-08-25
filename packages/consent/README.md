# @vizuh/clicktrail-consent

Small consent contracts shared by ClickTrail integrations.

This package does not provide a consent-management platform. Your CMP or
application owns the decision. These helpers give integrations one consistent
way to represent that decision and gate storage or transmission.

## Install

```sh
npm install @vizuh/clicktrail-consent
```

The package is ESM-only and requires Node.js 18 or later.

## Example

```ts
import {
  createConsentGate,
  transmissionAllowed,
} from '@vizuh/clicktrail-consent';

const snapshot = () => ({
  state: 'granted' as const,
  analytics: true,
  advertising: false,
  source: 'site-cmp',
});

const canTrack = createConsentGate(snapshot);
const canSend = transmissionAllowed(snapshot, 'analytics');
```

Unknown or denied consent does not allow storage or transmission. Revoke or
clear data through the host integration when consent is withdrawn.

## License

MIT — see [LICENSE](./LICENSE).
