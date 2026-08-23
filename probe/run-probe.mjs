#!/usr/bin/env node
/**
 * ClickTrail integration probe (Phase 1b exit criterion).
 *
 * Replays every golden fixture end-to-end in a REAL Chromium page:
 *   fixture JSON -> parseAttributionUrl -> engine -> browser SDK
 *   -> window.ClickTrail global -> dataLayer destination
 *
 * Determinism rules honored here:
 * - No real network destinations: assertions read the injected dataLayer
 *   array and getData()/getField(); the clock is injected from the fixture
 *   (`now`), so timestamps are identical run-to-run.
 * - Fixture inputs are embedded into the served page verbatim (the fixture
 *   URLs point at example.com; the SDK never reads location itself, so
 *   parsing uses the embedded input, not live document state).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fxDir = join(repoRoot, 'packages/clicktrail/fixtures');
const bundlePath = join(repoRoot, 'packages/clicktrail/dist/clicktrail.global.js');

const fixtures = readdirSync(fxDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(fxDir, f), 'utf8')) }));
if (fixtures.length === 0) {
  console.error('probe: no fixtures found under', fxDir);
  process.exit(1);
}

const bundleJs = readFileSync(bundlePath, 'utf8');

/** Embed JSON inside <script> safely (no </script> breakouts). */
const jsonForScriptTag = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

const PAGE_SCRIPT = () => {
    const fx = window.__FIXTURE__;
    const { createClickTrail, createLegacyGlobal, dataLayerDestination,
            parseAttributionUrl } = window.ClickTrail;

    // --- SSR/start() ordering side-check (deterministic, isolated instance):
    // track() BEFORE start() must be ignored (no delivery, no throw).
    const preDest = dataLayerDestination();
    const preInstance = createClickTrail({ destinations: [preDest] });
    preInstance.track('before_start_should_be_ignored');
    const preStartTrackIgnored =
      preDest.getArray().length === 0 && !preInstance.isStarted();

    // --- main replay ---
    const dest = dataLayerDestination();
    const ct = createClickTrail({ destinations: [dest], now: () => fx.input.now });
    ct.start();
    const parsed = parseAttributionUrl(fx.input);
    // Stored-state fixtures (Phase 2 harness extension): hydrate the visitor's
    // pre-existing payload BEFORE applying the new landing touch.
    if (fx.stored) ct.hydrateStoredPayload(fx.stored);
    if (parsed.kind === 'touch') ct.mergeParsedTouch(parsed.touch);
    const api = createLegacyGlobal(ct); // legacy global shape (getData/...)
    ct.track('page_view', { event_time: fx.input.now });

    return {
      preStartTrackIgnored,
      kind: parsed.kind,
      noTouchReason: parsed.kind === 'none' ? parsed.reason : null,
      channel: parsed.kind === 'touch' ? parsed.touch.channel : null,
      data: api.getData(),
      session: api.getSession(),
      events: dest.getArray(),
    };
};

const pageHtml = (fixture) => {
  const qs = new URL(fixture.input.url, 'https://placeholder.invalid').search;
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>ClickTrail probe</title></head>
<body>
<script>${bundleJs}</script>
<script>window.__FIXTURE__ = ${jsonForScriptTag(fixture)};</script>
<script>
  window.addEventListener('DOMContentLoaded', () => { window.__ready = true; });
</script>
<!-- navigated with the fixture's query string for URL-flow realism;
     parsing intentionally uses the embedded fixture input (deterministic) -->
</body>
</html>`;
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/clicktrail.global.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(bundleJs);
    return;
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/probe\//, '').replace(/\/$/, ''));
  const fixture = fixtures.find((f) => f.name === name);
  if (!fixture) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(pageHtml(fixture));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const results = [];
let failed = false;

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  for (const fixture of fixtures) {
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/probe/${encodeURIComponent(fixture.name)}`, {
        waitUntil: 'load',
      });
      await page.waitForFunction(() => window.__ready === true);
      const actual = await page.evaluate(PAGE_SCRIPT);

      const failures = [];
      const expected = fixture.expected ?? {};
      const noTouchReason = expected['_no_touch_reason'];

      if (!actual.preStartTrackIgnored) {
        failures.push('track() before start() was delivered (ordering contract broken)');
      }

      if (noTouchReason !== undefined) {
        if (actual.kind !== 'none') failures.push(`expected kind=none, got ${actual.kind}`);
        else if (actual.noTouchReason !== noTouchReason) {
          failures.push(`reason: expected ${noTouchReason}, got ${actual.noTouchReason}`);
        }
        // D3 audit keys are STRUCTURAL (initialized by emptyAttribution),
        // not attribution signal: excluded from the emptiness assertion.
        const AUDIT_KEYS = new Set(['click_id_history', 'attribution_selected_click_id', 'attribution_selected_click_id_reason']);
        const nonEmpty = Object.entries(actual.data)
          .filter(([k, v]) => !AUDIT_KEYS.has(k) && v !== '');
        if (nonEmpty.length > 0) {
          failures.push(`payload should be empty for no-touch, got ${JSON.stringify(nonEmpty)}`);
        }
        if (actual.events.length !== 1) {
          failures.push(`expected exactly 1 dataLayer event (page_view), got ${actual.events.length}`);
        }
      } else {
        if (actual.kind !== 'touch') {
          failures.push(`expected kind=touch, got ${actual.kind}`);
        } else {
          if (expected['_channel'] && actual.channel !== expected['_channel']) {
            failures.push(
              `channel: expected ${expected['_channel']}, got ${actual.channel}`,
            );
          }
          for (const [key, value] of Object.entries(expected)) {
            if (key.startsWith('_')) continue;
            if (actual.data[key] !== value) {
              failures.push(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual.data[key])}`);
            }
          }
        }
        if (actual.events.length !== 1) {
          failures.push(`expected exactly 1 dataLayer event (page_view), got ${actual.events.length}`);
        } else {
          const evt = actual.events[0] ?? {};
          if (evt.event_name !== 'page_view') {
            failures.push(`event_name: expected page_view, got ${String(evt.event_name)}`);
          }
          if (typeof evt.schema_version !== 'string' || evt.schema_version === '') {
            failures.push('schema_version stamp missing on dataLayer event');
          }
          if (typeof evt.classifier_version !== 'string' || evt.classifier_version === '') {
            failures.push('classifier_version stamp missing on dataLayer event');
          }
          for (const key of Object.keys(actual.data)) {
            if (evt[key] !== actual.data[key]) {
              failures.push(`event.${key} does not match payload (${JSON.stringify(evt[key])})`);
            }
          }
        }
      }

      // Session snapshot shape (empty until Phase 2 storage adapter lands).
      const sessionShape =
        actual.session &&
        typeof actual.session.visitorId === 'string' &&
        typeof actual.session.sessionId === 'string' &&
        typeof actual.session.sessionNumber === 'string';
      if (!sessionShape) failures.push(`getSession() shape invalid: ${JSON.stringify(actual.session)}`);

      if (failures.length > 0) failed = true;
      results.push({ name: fixture.name, ok: failures.length === 0, failures });
    } catch (err) {
      failed = true;
      results.push({ name: fixture.name, ok: false, failures: [`probe error: ${err.message}`] });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log('\n=== ClickTrail integration probe ===');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  for (const f of r.failures) console.log(`      - ${f}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} fixtures passed`);
process.exit(failed ? 1 : 0);
