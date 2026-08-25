import type { CookiesLike } from '../src/types.js';

/** Map-backed structural SvelteKit cookies helper for tests. */
export function makeCookieStore(initial: Record<string, string> = {}) {
  const jar = new Map<string, string>(Object.entries(initial));
  const written: Array<{ name: string; value: string; opts?: unknown }> = [];
  const store: CookiesLike = {
    get: (name) => jar.get(name),
    set: (name, value, opts) => {
      written.push({ name, value, ...(opts !== undefined ? { opts } : {}) });
      jar.set(name, value);
    },
  };
  return { store, jar, written };
}

export interface HandleHarness {
  store: ReturnType<typeof makeCookieStore>['store'];
  jar: ReturnType<typeof makeCookieStore>['jar'];
  written: ReturnType<typeof makeCookieStore>['written'];
  resolvedWith: Array<unknown>;
}

/** Build a fake RequestEventLike + resolve spy around a cookie store. */
export function makeEvent(
  url: string,
  cookieStore: ReturnType<typeof makeCookieStore>,
  headers: Record<string, string> = {},
): { event: import('../src/types.js').RequestEventLike; resolvedWith: Array<unknown>; response: Response } {
  const u = new URL(url);
  const response = new Response(null, { status: 200 });
  const event: import('../src/types.js').RequestEventLike = {
    url: u,
    request: new Request(u, { headers }),
    cookies: cookieStore.store,
  };
  const resolvedWith: Array<unknown> = [];
  return {
    event,
    resolvedWith,
    response,
  };
}
