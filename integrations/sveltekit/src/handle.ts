/**
 * @vizuh/clicktrail-sveltekit — handle hook factory.
 *
 * `clicktrail(options)` returns a SvelteKit handle-shaped hook. Server work
 * per request:
 * - optional first-party proxy short-circuit (before resolve)
 * - consent gate (`ct_consent`; nothing persisted or transmitted pre-consent
 *   when `consentRequired`)
 * - landing URL UTMs + click IDs parsed with the frozen core engine and
 *   merged into the first-party `ct_attribution` cookie (Path=/, SameSite=Lax)
 *
 * Zero `@sveltejs/kit` imports: structural types only.
 */
import type { HandleLike, RequestEventLike } from './types.js';
import { DEFAULT_PROXY_PATTERN, defaultProxyConfig } from './config.js';
import type { ClickTrailSvelteKitOptions } from './config.js';
import { createProxyHandler, dispatchProxyRequest } from './proxy.js';
import type { ProxyHandler } from './proxy.js';
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_SECONDS, encodeAttributionPayload, readAttributionCookie, readConsentFromCookies } from './cookies.js';
import { captureLandingAttribution } from './attribution.js';

export type { ClickTrailSvelteKitOptions };

function isAbsoluteEndpoint(endpoint: string): boolean {
  return /^https?:\/\//i.test(endpoint);
}

/**
 * Create the ClickTrail SvelteKit handle hook.
 *
 * Usage in `hooks.server.ts`:
 * ```ts
 * import { clicktrail } from '@vizuh/clicktrail-sveltekit';
 * export const handle = clicktrail({ siteId: 'my-site', proxy: { upstream: 'https://collector.example.com/v1/events' } });
 * ```
 */
export function clicktrail(options: ClickTrailSvelteKitOptions = {}): HandleLike {
  let proxyHandler: ProxyHandler | null = null;
  let proxyPattern: string | undefined;

  const proxyOption = options.proxy;
  if (proxyOption !== undefined && proxyOption !== false) {
    if (!proxyOption.upstream || !isAbsoluteEndpoint(proxyOption.upstream)) {
      throw new TypeError(
        "clicktrail: the first-party proxy needs an public absolute https `proxy.upstream`. " +
          "Set it or pass `proxy: false`.",
      );
    }
    proxyPattern = proxyOption.pattern ?? DEFAULT_PROXY_PATTERN;
    proxyHandler = createProxyHandler(
      defaultProxyConfig({
        upstream: proxyOption.upstream,
        ...(proxyOption.forwardHeaders !== undefined
          ? { forwardHeaders: proxyOption.forwardHeaders }
          : {}),
      }),
      options.fetch ?? fetch,
    );
  }

  const consentRequired = options.consentRequired ?? false;

  return async ({ event, resolve }: { event: RequestEventLike; resolve: (event: RequestEventLike) => Response | Promise<Response> }) => {
    // Proxy short-circuit: never reaches resolve() when enabled and matched.
    if (proxyHandler && event.url.pathname === proxyPattern) {
      return dispatchProxyRequest(proxyHandler, event.request);
    }

    const consent = readConsentFromCookies(event.cookies);
    // Honor the ct_consent cookie in BOTH modes: an explicit denial always
    // suppresses persistence. With consentRequired=true, tracking starts
    // only after an explicit grant.
    const allowed = consentRequired ? consent === true : consent !== false;

    if (allowed) {
      const result = captureLandingAttribution({
        url: event.url.href,
        referrer: event.request.headers.get('referer') ?? '',
        currentHost: event.url.host,
        stored: readAttributionCookie(event.cookies),
        now: new Date().toISOString(),
      });
      if (result.changed) {
        event.cookies.set(ATTRIBUTION_COOKIE, encodeAttributionPayload(result.payload), {
          path: '/',
          maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
          sameSite: 'lax',
        });
      }
    }

    return resolve(event);
  };
}

export default clicktrail;
