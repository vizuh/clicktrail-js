import {
  attachAttributionToAccount,
  captureFirstTouch,
  parseAttributionCookie,
  serializeAttributionCookie,
} from '../../src/index.js';

const landing = new URL(
  'https://recoupable.dev/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=demo-click',
);
const firstTouch = captureFirstTouch(landing, { now: '2026-09-01T10:00:00.000Z' });
const cookie = serializeAttributionCookie(firstTouch, { domain: '.recoupable.dev' });
const cookieValue = parseAttributionCookie(cookie);

const account = await attachAttributionToAccount('account-demo', {
  get: () => ({ value: JSON.stringify(cookieValue) }),
});

console.log(JSON.stringify(account.first_touch, null, 2));
