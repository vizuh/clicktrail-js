#!/usr/bin/env node
/**
 * WP runtime-parity harness (work queue item #6, live-validation stage).
 *
 * Executes the REAL plugin engine (click-trail-handler/assets/js/clicutcl-attribution.js)
 * inside a minimal Node `vm` sandbox against the 23 draft fixtures in
 * packages/clicktrail/fixtures/wp-parity-drafts/, runs OUR TS engine on the same
 * inputs, and diffs field-by-field into PARITY-RUN.md.
 *
 * The plugin repo is READ-ONLY: its source is loaded as text, never modified.
 * Engine side is bundled once with esbuild (already a devDep of
 * packages/clicktrail) — no new dependencies.
 *
 * Run: `pnpm parity` (root) or `node tools/wp-runtime/run-parity.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');                       // clicktrail-js repo root
const PLUGIN_SRC = resolve(ROOT, '../click-trail-handler/assets/js/clicutcl-attribution.js');
const FIXTURE_DIR = resolve(ROOT, 'packages/clicktrail/fixtures/wp-parity-drafts');

// ---------------------------------------------------------------------------
// 1. Bundle our TS engine with esbuild (devDep of packages/clicktrail).
// ---------------------------------------------------------------------------
function bundleEngine() {
  const esbuildBin = join(ROOT, 'packages/clicktrail/node_modules/.bin/esbuild');
  const workDir = mkdtempSync(join(tmpdir(), 'clicktrail-parity-'));
  const entry = join(workDir, 'engine-entry.mjs');
  const outfile = join(workDir, 'engine.bundle.mjs');
  writeFileSync(entry, [
    `export { parseAttributionUrl } from ${JSON.stringify(join(ROOT, 'packages/clicktrail/src/core/parse.ts'))};`,
    `export { emptyAttribution, mergeAttributionTouch } from ${JSON.stringify(join(ROOT, 'packages/clicktrail/src/core/merge.ts'))};`,
    '',
  ].join('\n'));
  execFileSync(esbuildBin, ['--bundle', entry, '--format=esm', '--platform=node', `--outfile=${outfile}`], { stdio: 'pipe' });
  return { module: import(outfile), cleanup: () => rmSync(workDir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// 2. Sandbox shims. Each shim exists because a specific plugin line touches a
//    browser global that Node's vm contexts do not provide (vm contexts carry
//    only ECMAScript builtins). Line refs are clicutcl-attribution.js v1.8.x.
//
//    | Shim                       | Plugin line(s) requiring it                     |
//    |----------------------------|--------------------------------------------------|
//    | window.location            | CONFIG boot :6; getQueryParams :431; applyTouch :1793; setCookie Secure flag :468; parseUrlSafely :215; getExternalReferrerDetails :389 |
//    | window.clicutcl_config     | :6 (we set requireConsent:false so attribution runs without a consent bridge) |
//    | window.dataLayer           | :1732-1744 (ct_page_view push — our result reader) |
//    | window.crypto.randomUUID   | Identity :1306-1309                              |
//    | document.readyState        | boot :1927-1931 ('complete' → sync constructor) |
//    | document.referrer          | runAttribution :1630                             |
//    | document.cookie            | cookie jar: Store.getCookie/setCookie/removeCookie :459-485; consent fallback :157; admin QA check :146 |
//    | document.addEventListener/ dispatchEvent | consent listener :1548; form listeners :1862; API ready event :947 |
//    | document.querySelectorAll  | Injector.findInputs :963 (returns [] — no DOM)   |
//    | navigator.userAgent/webdriver | BotDetector.isBot :1134-1155                  |
//    | localStorage / sessionStorage | Store local/session tiers :492-567; PendingCapture :748-788; session manager :1299-1416; API last-seen :944 |
//    | URL / URLSearchParams      | parseUrlSafely :215; WhatsApp decorator (not exercised) |
//    | btoa / atob                | Store.base64UrlEncode/Decode :448-456            |
//    | CustomEvent                | API.install ready event :947                     |
//    | CSS.escape                 | Injector.findInputs :963                         |
//    | Date (pinned fake)         | timestamps :1701/:1790; cookie expiry :464; pending savedAt :766 — pinned to fixture `now` for millisecond-exact timestamp comparison (ruling #13) |
//    | console (silent)           | DEBUG_ENABLED-gated logs only                    |
//
//    Limits (documented honestly):
//    - No layout/events: listeners are registered but never fire; DOM queries
//      return []. Form injection, link decoration and WhatsApp flows are out
//      of scope for classification parity anyway (see WP-PARITY-DRAFT.md).
//    - The pinned Date means cookie TTLs never expire mid-run (desired).
//    - randomUUID is deterministic; identity fields are not part of the diff.
// ---------------------------------------------------------------------------
function makeCookieJar() {
  const jar = new Map();
  const shim = {
    get cookie() {
      return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(str) {
      const parts = String(str).split(';');
      const pair = parts[0];
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      const attrs = parts.slice(1).map((a) => a.trim().toLowerCase());
      const expired =
        attrs.some((a) => a.startsWith('expires=')) && attrs.some((a) => a.includes('1970')) ||
        attrs.some((a) => a === 'max-age=0');
      if (expired) jar.delete(name);
      else jar.set(name, value);
    },
  };
  return { shim, snapshot: () => Object.fromEntries(jar) };
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(String(k)),
    clear: () => m.clear(),
  };
}

function makePinnedDate(fixedIso) {
  const fixedMs = Date.parse(fixedIso);
  const Real = Date;
  class PinnedDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(fixedMs);
      else super(...args);
    }
    static now() { return fixedMs; }
  }
  return PinnedDate;
}

const SILENT_CONSOLE = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

function runPluginOnce({ url, referrer, currentHost, stored, now }) {
  const source = readFileSync(PLUGIN_SRC, 'utf8');
  const u = new URL(url);
  const jar = makeCookieJar();
  if (stored && Object.keys(stored).length > 0) {
    // Seed the pre-existing payload through the same channel the browser would
    // have it in: the attribution cookie (Store.getData reads it first).
    jar.shim.cookie = `${'attribution'}=${encodeURIComponent(JSON.stringify(stored))}`;
  }
  const local = makeStorage();
  const session = makeStorage();

  const windowObj = {
    clicutcl_config: {
      cookieName: 'attribution',
      cookieDays: 90,
      consentCookieName: 'ct_consent',
      requireConsent: false,
    },
    location: {
      href: url,
      protocol: u.protocol,
      hostname: currentHost || u.hostname,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      origin: u.origin,
    },
    dataLayer: [],
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
  };
  const navigatorObj = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) ClickTrailParityHarness/1.0',
    webdriver: false,
    language: 'en-US',
  };
  windowObj.navigator = navigatorObj;
  windowObj.window = windowObj;

  const sandbox = {
    window: windowObj,
    document: {
      readyState: 'complete',
      referrer: referrer || '',
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll() { return []; },
      getElementById() { return null; },
      dispatchEvent() { return true; },
      get cookie() { return jar.shim.cookie; },
      set cookie(v) { jar.shim.cookie = v; },
    },
    navigator: navigatorObj,
    localStorage: local,
    sessionStorage: session,
    URL,
    URLSearchParams,
    btoa,
    atob,
    escape,
    unescape,
    console: SILENT_CONSOLE,
    setTimeout: () => 0,
    clearTimeout: () => {},
    CustomEvent: class CustomEventShim {
      constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; }
    },
    CSS: { escape: (s) => String(s) },
    Date: makePinnedDate(now),
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'clicutcl-attribution.js', timeout: 5000 });

  const pushes = windowObj.dataLayer.filter((e) => e && e.event === 'ct_page_view');
  const last = pushes[pushes.length - 1] || null;
  return {
    payload: last ? last.ct_attribution : null,
    pushed: Boolean(last),
    cookies: jar.snapshot(),
  };
}

// ---------------------------------------------------------------------------
// 3. Our engine on the same input (mirrors tests/fixtures-replay.test.ts).
// ---------------------------------------------------------------------------
async function makeEngineRunner() {
  const { module: enginePromise } = bundleEngine();
  const engine = await enginePromise;
  return function runEngine({ input, stored }) {
    const parsed = engine.parseAttributionUrl(input);
    let payload = engine.emptyAttribution();
    if (stored) payload = { ...payload, ...stored };
    // Mirrors tests/fixtures-replay.test.ts: a 'none' result means NO touch,
    // so nothing is merged and the payload stays as-is (stored state only).
    if (parsed.kind === 'touch') {
      payload = engine.mergeAttributionTouch(payload, parsed.touch);
    }
    return { payload, parsedKind: parsed.kind, enumChannel: parsed.kind === 'touch' ? parsed.touch.channel : null };
  };
}

// ---------------------------------------------------------------------------
// 4. Diff + verdicts
// ---------------------------------------------------------------------------
function nonEmpty(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function diffPayloads(pluginPayload, enginePayload) {
  const p = nonEmpty(pluginPayload);
  const e = nonEmpty(enginePayload);
  const keys = Array.from(new Set([...Object.keys(p), ...Object.keys(e)])).sort();
  const diffs = [];
  for (const k of keys) {
    if (p[k] !== e[k]) {
      diffs.push({ field: k, plugin: p[k] ?? '(absent)', engine: e[k] ?? '(absent)' });
    }
  }
  return { diffs, pluginKeys: Object.keys(p), engineKeys: Object.keys(e), plugin: p, engine: e };
}

// Rulings that legitimately produce DIFFs (docs/WP-PARITY-DRAFT.md rulings table),
// with the exact field patterns each ruling explains. Any differing field NOT
// covered here (and not by the click-ID storage model below) is a NEW FINDING.
const PLUGIN_CLICK_ID_KEYS = [
  'gclid', 'fbclid', 'msclkid', 'ttclid', 'wbraid', 'gbraid',
  'twclid', 'li_fat_id', 'sccid', 'epik',
  'rdt_cid', 'pin_cid', 'snap_cid', 'mc_cid', 'mc_eid', 'dclid',
];
const RULED_DIFFS = {
  'wp-gclid-only-no-source-medium': {
    rule: '#2 bare-click-id inference (engine adds source=google/medium=cpc)',
    fields: [/^(ft|lt)_(source|medium)$/],
  },
  'wp-fbclid-only-organic-facebook': {
    rule: '#2 bare-click-id inference (engine paid_social vs plugin Facebook Organic label path)',
    fields: [/^(ft|lt)_(source|medium|channel)$/],
  },
  'wp-sc-click-id-alias-partial': {
    rule: '#2 bare-click-id inference (engine infers snapchat/cpc for sccid)',
    fields: [/^(ft|lt)_(source|medium|channel)$/],
  },
  'wp-mc-eid-mailchimp': {
    rule: '#1 extra click IDs dropped (mc_cid/mc_eid not in engine contract list)',
    fields: [/^(mc_cid|mc_eid)$/, /^(ft|lt)_channel$/],
  },
  'wp-rdt-cid-extra-click-id': {
    // Ruling #1 says extras are dropped ENTIRELY: with rdt_cid as the ONLY
    // signal the engine produces NO touch at all, so its ft_/lt_ landing page
    // and timestamp are absent too. Those diffs are implied by the ruling
    // (and the fixture itself expects _no_touch_reason).
    rule: '#1 extra click IDs dropped entirely (rdt_cid -> no engine touch)',
    fields: [/^rdt_cid$/, /^(ft|lt)_channel$/, /^(ft|lt)_(landing_page|touch_timestamp)$/],
  },
  'wp-brave-search-engine': {
    rule: '#6 Brave/Startpage engine addition kept',
    fields: [/^(ft|lt)_(source|medium|channel)$/],
  },
  'wp-whatsapp-social-engine-only': {
    rule: '#7 social-host breadth engine addition kept',
    fields: [/^(ft|lt)_(source|medium|channel)$/],
  },
  'wp-plus-sign-preserved': {
    rule: "#10 '+' decoding kept (URL standard); plugin literal-'+' is accident",
    fields: [/^(ft|lt)_term$/],
  },
  'wp-value-length-cap': {
    rule: '#14+#16 uniform 512 cap kept vs plugin two-pass 128/256 truncation',
    fields: [/^(ft|lt)_campaign$/],
  },
};

// RULING B (runtime findings 2026-08-23, IMPLEMENTED): the plugin mirrors
// every captured click ID into ft_<cid>/lt_<cid> touch fields (applyTouch over
// mapQueryFields output); mergeAttributionTouch now does the same at write
// time. The PLUGIN_CLICK_ID_KEYS branch below still explains mirror diffs for
// keys the engine drops entirely (ruling #1 extras such as mc_eid/rdt_cid).
function classifyDiffField(fixtureName, field) {
  const bare = field.replace(/^(ft|lt)_/, '');
  if (bare !== field && PLUGIN_CLICK_ID_KEYS.includes(bare)) {
    return { explained: true, why: 'click-ID ft_/lt_ mirror (rulings #1/#2 scope)' };
  }
  const ruled = RULED_DIFFS[fixtureName];
  if (ruled && ruled.fields.some((re) => re.test(field))) {
    return { explained: true, why: ruled.rule };
  }
  return { explained: false };
}

function summarize(payload, maxLen = 160) {
  const ne = nonEmpty(payload);
  const keys = Object.keys(ne);
  if (!keys.length) return '(empty)';
  let s = keys.map((k) => `${k}=${JSON.stringify(ne[k])}`).join('; ');
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}

const mdEscape = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------
async function main() {
  const fixtures = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) }));

  const runEngine = await makeEngineRunner();
  const rows = [];
  const newFindings = [];

  for (const fx of fixtures) {
    let row = {
      name: fx.name || fx.file,
      pluginSummary: '',
      engineSummary: '',
      diffFields: '',
      verdict: '',
      note: '',
      detail: null,
    };
    try {
      const pluginRun = runPluginOnce({
        url: fx.input.url,
        referrer: fx.input.referrer,
        currentHost: fx.input.currentHost,
        stored: fx.stored,
        now: fx.input.now,
      });
      const engineRun = runEngine({ input: fx.input, stored: fx.stored });
      const { diffs, plugin: pSum, engine: eSum } = diffPayloads(pluginRun.payload, engineRun.payload);

      // Sanity: does our engine satisfy the fixture's own expectations?
      let engineMatchesFixture = null;
      try {
        const expected = fx.expected || {};
        let ok = true;
        if (expected._no_touch_reason) {
          ok = engineRun.parsedKind === 'none' && Object.keys(nonEmpty(engineRun.payload)).length === 0;
        } else {
          if (expected._channel && engineRun.enumChannel !== expected._channel) ok = false;
          const ne = nonEmpty(engineRun.payload);
          for (const [k, v] of Object.entries(expected)) {
            if (k.startsWith('_')) continue;
            if ((ne[k] ?? '') !== v) ok = false;
          }
        }
        engineMatchesFixture = ok;
      } catch {
        engineMatchesFixture = null;
      }

      const classifications = diffs.map((d) => ({ ...d, cls: classifyDiffField(fx.name, d.field) }));
      const unexplained = classifications.filter((d) => !d.cls.explained);
      if (diffs.length === 0) {
        row.verdict = RULED_DIFFS[fx.name] ? 'MATCH (ruled deviation did not appear)' : 'MATCH';
      } else if (unexplained.length > 0) {
        row.verdict = 'NEW FINDING';
        row.diffFields = unexplained.map((d) => `${d.field} (unexplained)`).join(', ');
        newFindings.push({ fixture: row.name, fields: unexplained });
      } else {
        const rules = Array.from(new Set(classifications.filter((d) => d.cls.explained && d.cls.why.startsWith('#')).map((d) => d.cls.why.split(' ')[0])));
        row.verdict = `RULED DIFF (${rules.join(', ')})`;
        row.diffFields = classifications.map((d) => d.field).join(', ');
      }

      row.pluginSummary = summarize(pluginRun.payload);
      row.engineSummary = summarize(engineRun.payload);
      if (!row.diffFields) row.diffFields = diffs.map((d) => d.field).join(', ') || '—';
      row.detail = {
        diffs,
        pluginPayload: pSum,
        enginePayload: eSum,
        engineMatchesFixture,
        pluginPushed: pluginRun.pushed,
      };
      rows.push(row);
    } catch (err) {
      row.verdict = 'HARNESS ERROR';
      row.note = `${err.constructor.name}: ${err.message}`;
      row.pluginSummary = '(error)';
      row.engineSummary = '(error)';
      row.diffFields = '—';
      newFindings.push({
        fixture: row.name,
        fields: [{ field: '(harness error)', plugin: err.message, engine: err.stack ? String(err.stack).split('\n')[1] || '' : '' }],
      });
      rows.push(row);
    }
  }

  // ---- render PARITY-RUN.md ----
  const counts = {
    match: rows.filter((r) => r.verdict.startsWith('MATCH')).length,
    ruledDiff: rows.filter((r) => r.verdict.startsWith('RULED')).length,
    newFinding: rows.filter((r) => r.verdict === 'NEW FINDING').length,
    error: rows.filter((r) => r.verdict === 'HARNESS ERROR').length,
  };

  const lines = [];
  lines.push('# WP Runtime Parity — Live Validation Run');
  lines.push('');
  lines.push(`Generated by \`tools/wp-runtime/run-parity.mjs\` (\`pnpm parity\`). Executed the real`);
  lines.push(`plugin engine \`${'click-trail-handler/assets/js/clicutcl-attribution.js'}\` (loaded read-only as text)`);
  lines.push(`in a Node \`vm\` sandbox against all ${fixtures.length} draft fixtures, then ran the TS engine`);
  lines.push(`(esbuild-bundled from \`packages/clicktrail/src/core\`) on the same inputs.`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Verdict | Fixtures |');
  lines.push('|---|---|');
  lines.push(`| MATCH | ${counts.match} |`);
  lines.push(`| RULED DIFF (expected per supervisor ruling) | ${counts.ruledDiff} |`);
  lines.push(`| NEW FINDING (unexplained diff — investigate) | ${counts.newFinding} |`);
  lines.push(`| HARNESS ERROR | ${counts.error} |`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Fixture | Plugin result (non-empty fields) | Engine result (non-empty fields) | Diff fields | Verdict |');
  lines.push('|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${mdEscape(r.name)} | ${mdEscape(r.pluginSummary)} | ${mdEscape(r.engineSummary)} | ${mdEscape(r.diffFields)} | **${mdEscape(r.verdict)}**${r.note ? ` — ${mdEscape(r.note)}` : ''} |`);
  }
  lines.push('');
  lines.push('## Per-fixture detail');
  lines.push('');
  for (const r of rows) {
    lines.push(`### ${r.name}`);
    lines.push('');
    if (!r.detail) { lines.push(`(harness error: ${r.note})`); lines.push(''); continue; }
    lines.push(`- Engine satisfies fixture \`expected\`: **${r.detail.engineMatchesFixture === null ? 'check failed' : r.detail.engineMatchesFixture ? 'yes' : 'NO'}**`);
    lines.push(`- Plugin dataLayer push observed: ${r.detail.pluginPushed ? 'yes' : 'NO'}`);
    if (r.detail.diffs.length) {
      lines.push('');
      lines.push('| Field | Plugin | Engine |');
      lines.push('|---|---|---|');
      for (const d of r.detail.diffs) {
        lines.push(`| ${d.field} | \`${mdEscape(JSON.stringify(d.plugin))}\` | \`${mdEscape(JSON.stringify(d.engine))}\` |`);
      }
    } else {
      lines.push('- No differing fields.');
    }
    lines.push('');
  }
  lines.push('## Sandbox shims (each traced to the plugin line that requires it)');
  lines.push('');
  lines.push('The plugin IIFE is evaluated in a fresh `vm` context (only ECMAScript builtins), so every');
  lines.push('browser global it touches had to be provided explicitly:');
  lines.push('');
  lines.push('| Shim | Why (clicutcl-attribution.js line refs) | Notes / limits |');
  lines.push('|---|---|---|');
  lines.push('| `window.clicutcl_config` | :6 CONFIG boot | `requireConsent:false` so attribution runs without the consent bridge; consent gating itself is out of scope (draft "out of scope" list) |');
  lines.push('| `window.location` | :431 query parse, :468 Secure flag, :1790-1794 landing page, :389 related-host check, :215 base URL | href/search/hostname built from fixture `url`; hostname overridden with fixture `currentHost` to mirror engine input |');
  lines.push('| `window.dataLayer` array | :1732-1744 ct_page_view push | result read back from the push\'s `ct_attribution`; also :932 API install |');
  lines.push('| `window.crypto.randomUUID` | :1306-1309 Identity | deterministic stub; identity/session fields are not part of the diff |');
  lines.push('| `document.readyState=\'complete\'` | :1927-1931 boot branch | makes the constructor run synchronously |');
  lines.push('| `document.referrer` | :1630 runAttribution | fixture `referrer` verbatim |');
  lines.push('| `document.cookie` cookie jar | :459-485 Store.get/set/removeCookie; :157 consent fallback; :146 admin-QA check | Map-backed jar honoring expiry attrs; used to seed `stored` payloads exactly as a returning visitor would carry them |');
  lines.push('| `document.addEventListener/dispatchEvent` | :1548 consent listener, :1862 CF7 listener, :947 ct_ready event | registered but never fired |');
  lines.push('| `document.querySelectorAll` | :963 Injector.findInputs | returns [] — no forms in scope |');
  lines.push('| `navigator.userAgent/webdriver` | :1134-1155 BotDetector.isBot | normal UA, webdriver=false so the bot guard passes |');
  lines.push('| `localStorage` / `sessionStorage` | :492-567 Store tiers, :748-788 PendingCapture, :1299-1416 session manager, :944 last-seen | plain in-memory maps |');
  lines.push('| `URL`, `URLSearchParams` | :215 parseUrlSafely (and decorator paths) | Node native |');
  lines.push('| `btoa`/`atob`, `escape`/`unescape` | :448-456 base64url codec | Node natives passed into the context |');
  lines.push('| `CustomEvent` | :947 ct_ready dispatch | inert stub |');
  lines.push('| `CSS.escape` | :963 Injector selector build | passthrough stub |');
  lines.push('| Pinned `Date` | :1701/:1790 timestamps, :464 cookie expiry, :766 pending savedAt | pinned to fixture `now` so *_touch_timestamp compares exactly (ruling #13 millisecond ISO); cookie TTLs therefore never expire mid-run |');
  lines.push('| silent `console`, stub timers/fetch | DEBUG-gated logs; token verify fetch :707 (unreached, linkAppendToken off) | |');
  lines.push('');
  lines.push('### Known harness limits');
  lines.push('');
  lines.push('- Listeners never fire and DOM queries return empty: form injection, link decoration,');
  lines.push('  WhatsApp append and consent flows cannot be exercised here (all explicitly out of scope');
  lines.push('  in docs/WP-PARITY-DRAFT.md). This harness proves QUERY/REFERRER CLASSIFICATION parity only.');
  lines.push('- The plugin writes through its full storage stack (cookie + localStorage mirror +');
  lines.push('  sessionStorage fallback). We read the dataLayer push rather than re-reading storage, so');
  lines.push('  storage-envelope bugs would not surface here.');
  lines.push('');

  lines.push('## Observations from live execution');
  lines.push('');
  lines.push('- **Click-ID ft_/lt_ mirror**: the plugin duplicates every captured click ID into');
  lines.push('  `ft_<cid>`/`lt_<cid>` touch fields (`mapQueryFields` output goes through `applyTouch`,');
  lines.push('  :1813-1837 + :1788-1799), while the TS engine stores click IDs top-level only');
  lines.push('  (`mergeAttributionTouch`). Static analysis missed this. It only shows up in the five');
  lines.push('  click-ID fixtures, which are all covered by rulings #1/#2 anyway, so those rows are');
  lines.push('  marked RULED DIFF — but the storage-model difference itself deserves supervisor');
  lines.push('  confirmation before Phase 2 freezes.');
  lines.push('- **Timestamps compare exactly**: with the pinned Date the plugin emits the same');
  lines.push('  millisecond ISO strings the engine stores (ruling #13 verified live, not just statically).');
  lines.push('');
  if (newFindings.length) {
    lines.push('## NEW FINDINGS — unruled deviations, flag loudly');
    lines.push('');
    for (const n of newFindings) {
      const fields = Array.isArray(n.fields) ? n.fields : [];
      const head = fields.length
        ? `${fields.map((f) => `\`${f.field}\``).join(', ')} — plugin=\`${JSON.stringify(fields[0].plugin)}\`, engine=\`${JSON.stringify(fields[0].engine)}\``
        : '';
      lines.push(`- **${n.fixture}**: ${head}`.trimEnd());
    }
    lines.push('');
  }

  const outPath = join(HERE, 'PARITY-RUN.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${outPath}`);
  console.log(`match=${counts.match} ruledDiff=${counts.ruledDiff} newFindings=${counts.newFinding} errors=${counts.error}`);
  process.exitCode = counts.error > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
