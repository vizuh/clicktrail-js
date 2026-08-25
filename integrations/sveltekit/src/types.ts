/**
 * Structural SvelteKit types.
 *
 * Zero `@sveltejs/kit`, `svelte`, or `vite` imports (same discipline as the
 * astro integration: zero framework imports). The shapes below mirror
 * sveltekit@2 `RequestEvent` / `Handle` closely enough that the factory
 * return value satisfies the real interfaces, but the package builds and
 * tests without any Svelte dependency installed. A peerDependency entry
 * documents the runtime expectation for consumers.
 */

export type MaybePromise<T> = T | Promise<T>;

/** Subset of SvelteKit cookie serialize options used by this package. */
export interface CookieSerializeOptionsLike {
  path?: string;
  maxAge?: number;
  sameSite?: boolean | 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';
  httpOnly?: boolean;
  secure?: boolean;
}

/** Structural subset of SvelteKit's `Cookies` helper. */
export interface CookiesLike {
  get(name: string, opts?: unknown): string | undefined;
  set(
    name: string,
    value: string,
    opts?: CookieSerializeOptionsLike,
  ): void;
  delete?(name: string, opts?: CookieSerializeOptionsLike): void;
}

/** Structural subset of SvelteKit's `RequestEvent`. */
export interface RequestEventLike {
  url: URL;
  request: Request;
  cookies: CookiesLike;
  [key: string]: unknown;
}

export interface ResolveLike {
  (event: RequestEventLike): MaybePromise<Response>;
}

export interface HandleInputLike {
  event: RequestEventLike;
  resolve: ResolveLike;
}

/** Handle-shaped hook: `(input) => resolve(event)` with attribution work in front. */
export type HandleLike = (input: HandleInputLike) => MaybePromise<Response>;
