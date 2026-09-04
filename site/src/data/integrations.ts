// One structured source of truth for every ClickTrail integration page.
// Every fact below traces to a repo README or docs file:
//   - integrations/*/README.md, packages/*/README.md, python/*/README.md
//   - README.md (root), docs/EVENT-CONTRACT.md, docs/RESTRUCTURE-PLAN.md
// Do not invent features, versions, or metrics here.

export type IntegrationCategory =
  | 'Frameworks'
  | 'Automation'
  | 'Commerce & CMS'
  | 'Languages & platforms'
  | 'WordPress';

export type IntegrationStatus = 'stable' | 'rc' | 'experimental';

export interface Integration {
  slug: string;
  name: string;
  category: IntegrationCategory;
  npmName?: string;
  /** GitHub repository URL (brand-first repos) or wordpress.org listing. */
  repoUrl: string;
  /** Path inside the clicktrail-js monorepo, when the code lives there. */
  monorepoPath?: string;
  installCommand: string;
  summary: string;
  features: string[];
  status: IntegrationStatus;
}

const MONO = 'https://github.com/vizuh/clicktrail-js';

export const CATEGORY_ORDER: IntegrationCategory[] = [
  'Frameworks',
  'Automation',
  'Commerce & CMS',
  'Languages & platforms',
  'WordPress',
];

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  stable: 'Stable',
  rc: 'Release candidate',
  experimental: 'Experimental',
};

export const integrations: Integration[] = [
  // ---- Frameworks ----
  {
    slug: 'astro',
    name: 'Astro',
    category: 'Frameworks',
    npmName: '@vizuh/clicktrail-astro',
    repoUrl: `${MONO}/tree/master/integrations/astro`,
    monorepoPath: 'integrations/astro',
    installCommand: 'npx astro add @vizuh/clicktrail-astro',
    summary:
      'Astro integration that injects the browser SDK on every page, dedupes page views across view transitions, and adds an optional first-party proxy route plus server-side conversion helpers.',
    features: [
      'Browser SDK injection into every page via a `page` pattern script',
      'View-transition-safe page views with URL-keyed dedupe',
      'First-touch preserved, last-touch updated on every navigation',
      'Consent gate: nothing starts or persists before grant',
      'Optional first-party proxy route that strips visitor IPs',
      'Server helpers for leads, bookings, and purchases; works in static, SSR, and hybrid modes',
    ],
    status: 'rc',
  },
  {
    slug: 'nuxt',
    name: 'Nuxt',
    category: 'Frameworks',
    npmName: '@vizuh/clicktrail-nuxt',
    repoUrl: `${MONO}/tree/master/integrations/nuxt`,
    monorepoPath: 'integrations/nuxt',
    installCommand: 'npx nuxi module add @vizuh/clicktrail-nuxt',
    summary:
      'Nuxt module that boots the browser SDK SSR-safely, tracks router-aware page views without duplicates, and shares a cookie-backed consent flag between server and client.',
    features: [
      'SSR-safe client plugin registration',
      'Router-aware page views with duplicate suppression across vue-router navigations',
      'Cookie-backed consent flag shared between server and client',
      'Optional first-party Nitro proxy endpoint (`firstPartyProxy`)',
      'Server-side helpers for leads, bookings, and purchases',
    ],
    status: 'rc',
  },
  {
    slug: 'sveltekit',
    name: 'SvelteKit',
    category: 'Frameworks',
    npmName: '@vizuh/clicktrail-sveltekit',
    repoUrl: `${MONO}/tree/master/integrations/sveltekit`,
    monorepoPath: 'integrations/sveltekit',
    installCommand: 'npm install @vizuh/clicktrail-sveltekit',
    summary:
      'SvelteKit handle hook and layout component: landing UTMs and click IDs captured server-side, page views deduped across client navigations, conversions sent from form actions.',
    features: [
      '`handle` hook captures landing UTMs and click IDs into a first-party cookie',
      'ClickTrail component boots the SDK on an afterNavigate seam',
      'Consent gating via the shared ct_consent cookie',
      'Optional first-party proxy with configurable forwarded headers',
      'Server helpers callable from +page.server.ts and form actions',
    ],
    status: 'rc',
  },
  {
    slug: 'sv',
    name: 'Svelte CLI add-on',
    category: 'Frameworks',
    npmName: '@vizuh/clicktrail-sv',
    repoUrl: `${MONO}/tree/master/integrations/sv`,
    monorepoPath: 'integrations/sv',
    installCommand: 'npx sv add @vizuh/clicktrail-sv',
    summary:
      'Experimental Svelte CLI add-on that scaffolds the SvelteKit hook, root layout, environment placeholder, and a server-side conversion example.',
    features: [
      'Scaffolds the @vizuh/clicktrail-sveltekit server hook and root layout component',
      'Adds a .env placeholder for the site ID and optional first-party proxy',
      'Includes an example server-side conversion endpoint',
      'Applies only to SvelteKit projects and avoids unstable sv runtime imports',
    ],
    status: 'experimental',
  },
  {
    slug: 'qwik',
    name: 'Qwik',
    category: 'Frameworks',
    npmName: '@vizuh/clicktrail-qwik',
    repoUrl: `${MONO}/tree/master/integrations/qwik`,
    monorepoPath: 'integrations/qwik',
    installCommand: 'npm install @vizuh/clicktrail-qwik',
    summary:
      'Qwik City integration that captures initial attribution in ordinary SSR middleware — zero added eager client JS — and prefers server-side senders from your existing route actions.',
    features: [
      'Initial attribution parsed in Qwik City middleware with zero eager client JS',
      'Request-local identity store via sharedMap',
      'First-party cookie mirror only after consent is granted; pre-consent stays in memory',
      'Page-view dedupe on pathname + search over an injectable navigation seam',
      'Conversions sent from route actions; never throws into host handling',
      'Resumability-friendly: bootClickTrailClient runs only where you call it',
    ],
    status: 'rc',
  },

  // ---- Automation ----
  {
    slug: 'n8n',
    name: 'n8n',
    category: 'Automation',
    npmName: 'n8n-nodes-clicktrail',
    repoUrl: `${MONO}/tree/master/integrations/n8n`,
    monorepoPath: 'integrations/n8n',
    installCommand: 'Settings → Community Nodes → Install → n8n-nodes-clicktrail',
    summary:
      'n8n community node covering lead, conversion, and consent operations — from lead creation to offline conversions — with failures surfaced as NodeApiError, never silent success.',
    features: [
      'Lead operations: create/identify, attach attribution, stage update, qualify, merge visitor',
      'Conversion operations: appointments, sales, recurring revenue, refunds, offline conversions',
      'Consent operations: record, withdraw, policy update, anonymize visitor request',
      'Every operation POSTs { events: [event] } and returns { ok, status } per item',
      'Failures surface as NodeApiError with the operation name included',
      'Triggers deferred pending stable outbound ClickTrail webhooks',
    ],
    status: 'rc',
  },
  {
    slug: 'activepieces',
    name: 'Activepieces',
    category: 'Automation',
    npmName: '@vizuh/clicktrail-piece',
    repoUrl: `${MONO}/tree/master/integrations/activepieces`,
    monorepoPath: 'integrations/activepieces',
    installCommand: 'npm i @vizuh/clicktrail-piece',
    summary:
      'Activepieces piece with eight actions — identify, attribute, booking, sale, refund, consent — where every action translates its inputs into exactly one event through the shared SDK.',
    features: [
      'Eight actions incl. sale/refund/consent; each maps to exactly ONE event',
      'All events built through the shared @vizuh/clicktrail SDK (buildEventPayload)',
      'No attribution logic in the piece itself — the SDK owns it',
      'Custom-auth connection: API key, site ID, optional workspace ID and base URL for self-hosting',
      'Each send resolves to { ok, status, event }; delivery failures reject loudly',
      'Triggers deferred until ClickTrail exposes stable outbound webhooks',
    ],
    status: 'rc',
  },
  {
    slug: 'typebot',
    name: 'Typebot',
    category: 'Automation',
    npmName: '@vizuh/clicktrail-typebot',
    repoUrl: `${MONO}/tree/master/integrations/typebot`,
    monorepoPath: 'integrations/typebot',
    installCommand: 'pnpm add @vizuh/clicktrail-typebot',
    summary:
      'Typebot block logic mapping conversation variables onto canonical fields, with a never-throws send guarantee so analytics can never break a chat flow.',
    features: [
      'Eight actions: identify visitor, form started/completed, qualified lead, booking, sale, consent, attribution passthrough',
      'Never-throws guarantee: send resolves { ok, status } and never throws into the host flow',
      'Validation errors surface at build/test time, not mid-conversation',
      'Zero runtime dependencies and zero @typebot.io imports by design',
      'Works today via copy-paste Code steps while upstream block loading is unavailable',
      'Upstream issue draft posted before any PR (issue-first path)',
    ],
    status: 'experimental',
  },

  // ---- Commerce & CMS ----
  {
    slug: 'directus',
    name: 'Directus',
    category: 'Commerce & CMS',
    npmName: 'directus-extension-clicktrail',
    repoUrl: `${MONO}/tree/master/integrations/directus`,
    monorepoPath: 'integrations/directus',
    installCommand: 'pnpm add directus-extension-clicktrail',
    summary:
      'Directus extension with four components: a Flow operation, an attribution hook on collection creates, a Campaign → Lead → Sale dashboard panel, and a settings module.',
    features: [
      'Flow operation builds one stamped event per run and never fails the Flow on outages',
      'API hook extracts attribution signals on items.create in configurable collections',
      'Dashboard panel: three-stage funnel with per-campaign breakdown',
      'Settings module for site ID, endpoint, masked API key, consent flag, field mappings',
      'Registry discoverable via directus-extension keyword + directus.host field (^10 || ^11)',
      'Events optionally stored locally in the clicktrail_events collection',
    ],
    status: 'rc',
  },
  {
    slug: 'django-clicktrail',
    name: 'Django',
    category: 'Commerce & CMS',
    npmName: 'django-clicktrail',
    repoUrl: `${MONO}/tree/master/python/django_clicktrail`,
    monorepoPath: 'python/django_clicktrail',
    installCommand: 'pip install django-clicktrail clicktrail',
    summary:
      'Django integration on top of the shared clicktrail Python client: attribution middleware, template tags, and conversion shortcuts.',
    features: [
      'Middleware parses landing UTMs/click IDs via clicktrail.parse_landing',
      'Attaches request.clicktrail with flat attribution fields plus visitor_id',
      'Persists the first-party visitor cookie ct_vid (SameSite=Lax, secure when HTTPS)',
      'Template tags and conversion shortcuts on the shared client',
      'Configured via CLICKTRAIL_ENDPOINT / CLICKTRAIL_API_KEY / CLICKTRAIL_SITE_ID settings',
    ],
    status: 'rc',
  },
  {
    slug: 'wagtail-clicktrail',
    name: 'Wagtail',
    category: 'Commerce & CMS',
    npmName: 'wagtail-clicktrail',
    repoUrl: `${MONO}/tree/master/python/wagtail_clicktrail`,
    monorepoPath: 'python/wagtail_clicktrail',
    installCommand: 'pip install wagtail-clicktrail clicktrail django-clicktrail',
    summary:
      'Wagtail integration built on django-clicktrail: form submissions become attributed leads and user signups are identified.',
    features: [
      'ClickTrailFormPage: drop-in replacement for the classic FormPage',
      'Each form submission sends a mapped lead event with the captured visitor id',
      'User signups identified via user_post_save (creation only)',
      'Pure mapping helper tested without wagtail installed',
      'Auto-connects the form-submission signal if wagtail reintroduces it',
    ],
    status: 'rc',
  },

  // ---- Languages & platforms ----
  {
    slug: 'python-sdk',
    name: 'Python SDK',
    category: 'Languages & platforms',
    npmName: 'clicktrail',
    repoUrl: `${MONO}/tree/master/python/clicktrail`,
    monorepoPath: 'python/clicktrail',
    installCommand: 'pip install clicktrail',
    summary:
      'Stdlib-only Python SDK: canonical events, JS-bit-exact idempotent event ids, injectable transport for tests, and senders that never raise for network failures.',
    features: [
      'Senders: track, lead, conversion, booking, refund, consent — all return ClickTrailResult(ok, status, event_id)',
      'Never raises for network failures; validation errors raise TypeError before sending',
      'Deterministic event ids via derive_stable_event_id (sha256-128-v1, matching the JS core) when external_key is given',
      'Injectable http_post transport for tests; default uses urllib.request',
      'Helpers: ids, events, retry, landing.parse_landing / classify_referrer',
    ],
    status: 'rc',
  },
  {
    slug: 'clicktrail-asgi',
    name: 'ASGI middleware',
    category: 'Languages & platforms',
    npmName: 'clicktrail-asgi',
    repoUrl: `${MONO}/tree/master/python/clicktrail_asgi`,
    monorepoPath: 'python/clicktrail_asgi',
    installCommand: 'pip install clicktrail-asgi',
    summary:
      'Pure-ASGI middleware with no Starlette or FastAPI imports — FastAPI/Starlette-ready by conforming to the ASGI interface alone.',
    features: [
      'Wraps any raw ASGI app in one line',
      'scope["clicktrail"] carries attribution parsed from the landing query (utm_*, gclid/gbraid/wbraid/fbclid/msclkid)',
      'Consent read from the ct_consent cookie; send() is a no-op returning None when not granted',
      'Background delivery keeps request handling unblocked',
    ],
    status: 'rc',
  },
  {
    slug: 'clicktrail-jinja',
    name: 'Jinja2',
    category: 'Languages & platforms',
    npmName: 'clicktrail-jinja',
    repoUrl: `${MONO}/tree/master/python/clicktrail_jinja`,
    monorepoPath: 'python/clicktrail_jinja',
    installCommand: 'pip install clicktrail-jinja',
    summary:
      'Jinja2 extension exposing ClickTrail template globals for any Python templating stack.',
    features: [
      'clicktrail_head(): the loader script snippet with escaped attributes',
      'clicktrail_attribution_inputs(payload_json): one hidden input per payload key, HTML-escaped',
      'clicktrail_consent(state): small script setting the ct_consent cookie',
      'Configured via env.clicktrail_config (script_url, site_id)',
    ],
    status: 'rc',
  },
  {
    slug: 'flask-clicktrail',
    name: 'Flask',
    category: 'Languages & platforms',
    npmName: 'flask-clicktrail',
    repoUrl: `${MONO}/tree/master/python/flask_clicktrail`,
    monorepoPath: 'python/flask_clicktrail',
    installCommand: 'pip install flask-clicktrail',
    summary:
      'Flask extension wiring landing-query parsing and conversion sends into the standard Flask lifecycle.',
    features: [
      'after_request hook parses the landing query into flask.g.clicktrail_attribution',
      'Shared client stored on app.extensions["clicktrail"]',
      'track_conversion() never raises for network failures',
      'Config via CLICKTRAIL_SITE_ID / ENDPOINT / API_KEY keys or init_app kwargs',
    ],
    status: 'rc',
  },
  {
    slug: 'gtm-event-tag',
    name: 'GTM event tag',
    category: 'Languages & platforms',
    repoUrl: 'https://github.com/vizuh/clicktrail-gtm-event-tag',
    installCommand: 'Community Template Gallery (submission gated on public collector API docs)',
    summary:
      'Google Tag Manager community template that sends canonical ClickTrail events from GTM containers.',
    features: [
      'Brand-first repo under the vizuh org: clicktrail-gtm-event-tag',
      'Gallery submission gated on public collector API docs and signed attestations',
      'Part of the ratified submission ladder after Directus/Strapi',
    ],
    status: 'experimental',
  },
  {
    slug: 'gtm-attribution-variable',
    name: 'GTM attribution variable',
    category: 'Languages & platforms',
    repoUrl: 'https://github.com/vizuh/clicktrail-gtm-attribution-variable',
    installCommand: 'Community Template Gallery (submission gated on public collector API docs)',
    summary:
      'Google Tag Manager variable template exposing ClickTrail first-touch/last-touch attribution to other tags.',
    features: [
      'Brand-first repo under the vizuh org: clicktrail-gtm-attribution-variable',
      'Reads flat ft_* / lt_* attribution for use in any GTM tag or trigger',
      'Gallery submission gated on public collector API docs and signed attestations',
    ],
    status: 'experimental',
  },

  // ---- WordPress ----
  {
    slug: 'wordpress',
    name: 'WordPress plugin',
    category: 'WordPress',
    repoUrl: 'https://wordpress.org/plugins/click-trail-handler/',
    installCommand: 'Install "Click Trail Handler" from the WordPress plugin directory',
    summary:
      'The WordPress distribution of ClickTrail (plugin: click-trail-handler). The JS repository is the shared deterministic engine beneath it; golden fixtures captured from the live plugin are the executable spec.',
    features: [
      'Live distribution on wordpress.org; GPL-2.0-or-later',
      'Source of the golden fixtures replayed in CI for engine parity',
      'Full trail capture: UTMs, ad click IDs, referrer classification',
      'First-party storage under your own domain',
    ],
    status: 'stable',
  },
];

export function byCategory(): Map<IntegrationCategory, Integration[]> {
  const map = new Map<IntegrationCategory, Integration[]>();
  for (const category of CATEGORY_ORDER) map.set(category, []);
  for (const item of integrations) map.get(item.category)?.push(item);
  return map;
}

export function related(item: Integration): Integration[] {
  return integrations.filter((x) => x.category === item.category && x.slug !== item.slug);
}
