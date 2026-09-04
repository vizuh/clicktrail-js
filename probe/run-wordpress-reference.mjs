#!/usr/bin/env node
/**
 * Production-shaped, synthetic WordPress -> CRM reference fixture.
 *
 * A localhost server stands in for a cached WordPress page and a
 * customer-controlled CRM endpoint. Chromium exercises real cookies,
 * localStorage, MutationObserver, form submission, and HTTP delivery.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(
  join(repoRoot, 'probe/fixtures/wordpress-to-crm.json'),
  'utf8',
));
const bundleJs = readFileSync(
  join(repoRoot, 'packages/clicktrail/dist/clicktrail.global.js'),
  'utf8',
);

const jsonForScriptTag = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const crmEvents = [];
const crmForms = [];

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new Error('request body exceeds fixture limit');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function pageHtml(page) {
  const now = page === 'landing' ? fixture.first_touch.now : fixture.last_touch.now;
  const dynamicForm = page === 'contact';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>ClickTrail WordPress reference</title></head>
<body class="wp-site-blocks">
  <main id="primary" class="wp-block-group">
    <h1>${dynamicForm ? 'Contact' : 'Campaign landing'}</h1>
    ${dynamicForm ? '<div id="form-slot"></div>' : `<a id="continue" href="${fixture.last_touch.path}">Continue</a>`}
  </main>
  <script>${bundleJs}</script>
  <script>
    const fixture = ${jsonForScriptTag(fixture)};
    const consentGranted = () => document.cookie.split('; ').includes('fixture_consent=granted');
    const crm = ClickTrail.httpDestination({
      endpoint: '/crm/events',
      batchSize: 1,
      beacon: false,
    });
    const clickTrail = ClickTrail.createClickTrail({
      destinations: [crm],
      consentGate: consentGranted,
      consentState: () => ({ analytics: consentGranted(), advertising: consentGranted() }),
      workspaceId: 'reference-workspace',
      siteId: 'reference-wordpress',
      now: () => '${now}',
      storage: { cookieAttrs: { path: '/', sameSite: 'Lax' } },
      forms: {},
    });

    const capturePage = () => {
      const parsed = ClickTrail.parseAttributionUrl({
        url: location.href,
        referrer: document.referrer,
        currentHost: location.hostname,
        now: '${now}',
      });
      if (parsed.kind === 'touch') clickTrail.mergeParsedTouch(parsed.touch);
      clickTrail.track('page_view', { event_time: '${now}' });
    };

    clickTrail.start();
    if (consentGranted()) capturePage();
    else clickTrail.track('page_view', { event_time: '${now}' });

    window.__reference = {
      clickTrail,
      grant() {
        document.cookie = 'fixture_consent=granted; Path=/; SameSite=Lax';
        capturePage();
      },
      withdraw() {
        document.cookie = 'fixture_consent=; Path=/; Max-Age=0; SameSite=Lax';
        clickTrail.track('consent_updated');
      },
    };

    ${dynamicForm ? `setTimeout(() => {
      const form = document.createElement('form');
      form.id = fixture.conversion.form_id;
      form.innerHTML = '<input name="email" value="person@example.test"><button type="submit">Send</button>';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(form).entries());
        clickTrail.track('form_submission', {
          event_id: fixture.conversion.event_id,
          event_time: fixture.conversion.occurred_at,
          form_provider: fixture.conversion.form_provider,
          form_id: fixture.conversion.form_id,
        });
        const response = await fetch('/crm/forms', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(fields),
        });
        window.__formDelivered = response.ok;
      });
      document.querySelector('#form-slot').append(form);
    }, 25);` : ''}

    window.__fixtureReady = true;
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/crm/events') {
      crmEvents.push(await readJson(req));
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/crm/forms') {
      crmForms.push(await readJson(req));
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === '/wp/landing/' || url.pathname === '/wp/contact/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=600',
        'x-reference-cache': 'HIT',
      });
      res.end(pageHtml(url.pathname === '/wp/landing/' ? 'landing' : 'contact'));
      return;
    }
    res.writeHead(404).end();
  } catch (error) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(error instanceof Error ? error.message : 'bad request');
  }
});

async function waitFor(predicate, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browserName = process.env.CLICKTRAIL_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`reference fixture: unsupported CLICKTRAIL_BROWSER=${browserName}`);

const browser = await browserType.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const landingResponse = await page.goto(`${baseUrl}${fixture.first_touch.path}`, { waitUntil: 'load' });
  assert.equal(landingResponse?.headers()['x-reference-cache'], 'HIT');
  await page.waitForFunction(() => window.__fixtureReady === true);
  assert.equal(crmEvents.length, 0, 'consent-denied landing must not deliver');
  assert.equal(await page.evaluate(() => document.cookie.includes('attribution=')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('attribution')), null);

  await page.evaluate(() => window.__reference.grant());
  await waitFor(() => crmEvents.length === 1, 'consented landing page was not delivered');
  assert.equal(await page.evaluate(() => document.cookie.includes('attribution=')), true);

  const [contactResponse] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.click('#continue'),
  ]);
  assert.equal(contactResponse?.headers()['x-reference-cache'], 'HIT');
  await page.waitForSelector('#lead-form', { state: 'attached', timeout: 5_000 }).catch(() => {
    throw new Error(`dynamic form was not created: ${pageErrors.join('; ') || 'no page error'}`);
  });
  await page.waitForSelector('#lead-form input[name="ct_ft_source"]', {
    state: 'attached',
    timeout: 5_000,
  }).catch(() => {
    throw new Error(`ClickTrail fields were not injected: ${pageErrors.join('; ') || 'no page error'}`);
  });

  const formFields = await page.$eval('#lead-form', (form) =>
    Object.fromEntries(new FormData(form).entries()),
  );
  for (const [key, expected] of Object.entries(fixture.expected)) {
    assert.equal(formFields[`ct_${key}`], expected, `form ${key}`);
  }

  await page.click('#lead-form button[type="submit"]');
  await waitFor(() => crmForms.length === 1, 'form payload did not reach CRM endpoint');
  const leadEvent = await waitFor(
    () => crmEvents.flatMap((batch) => batch.events ?? [])
      .find((event) => event.event_name === 'form_submission'),
    'ClickTrail lead event did not reach CRM endpoint',
  );

  for (const [key, expected] of Object.entries(fixture.expected)) {
    assert.equal(leadEvent[key], expected, `event ${key}`);
    assert.equal(crmForms[0][`ct_${key}`], expected, `CRM form ${key}`);
  }
  assert.equal(leadEvent.event_id, fixture.conversion.event_id);
  assert.equal(leadEvent.marketing_trail.event_name, 'lead_submitted');
  assert.equal(leadEvent.marketing_trail.source, fixture.expected.lt_source);
  assert.equal(leadEvent.marketing_trail.form.provider, fixture.conversion.form_provider);
  assert.equal(leadEvent.marketing_trail.form.form_id, fixture.conversion.form_id);
  assert.equal(leadEvent.marketing_trail.consent.analytics, true);
  assert.equal(leadEvent.marketing_trail.consent.advertising, true);
  assert.equal(crmForms[0].email, 'person@example.test');
  assert.equal('email' in leadEvent, false, 'ClickTrail event must not copy form PII');

  const deliveredBeforeWithdrawal = crmEvents.length;
  await page.evaluate(() => {
    window.__reference.withdraw();
    window.__reference.clickTrail.track('form_submission', { event_id: 'evt_after_withdrawal' });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(crmEvents.length, deliveredBeforeWithdrawal, 'withdrawn consent delivered an event');
  assert.equal(await page.evaluate(() => document.cookie.includes('attribution=')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('attribution')), null);
  assert.equal(await page.locator('#lead-form input[name^="ct_"]').count(), 0);
  assert.deepEqual(pageErrors, []);

  console.log(`PASS  ${fixture.name}`);
  console.log('      consent denied -> first touch -> cached navigation -> dynamic form -> CRM -> withdrawal');
} finally {
  await browser.close();
  server.close();
}
