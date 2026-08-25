/**
 * EXPERIMENTAL structural types for a Svelte CLI (`sv`) community add-on.
 *
 * Zero `sv` / `@sveltejs/cli` imports (same discipline as the framework
 * integrations). The shapes mirror the sv add-on contract as best known
 * TODAY and WILL CHANGE without a semver break while EXPERIMENTAL — see
 * UPSTREAM-ISSUE-DRAFT.md for the issue-first path to the real contract.
 */

/** Prompt shown by the CLI before applying the add-on. */
export interface AddonQuestion {
  /** Answer key, e.g. 'siteId'. */
  id: string;
  /** Human prompt text. */
  question: string;
  /** Free-text input today; extended when the upstream contract stabilizes. */
  type: 'string';
  /** Pre-filled value when the user presses enter. */
  default?: string;
  required?: boolean;
  /** Placeholder hint rendered by the CLI. */
  placeholder?: string;
}

export type AddonAnswers = Record<string, string>;

/** One file the add-on applies to the user's project. */
export interface AddonFile {
  /** Target path relative to the project root. */
  name: string;
  /**
   * File content: a static string or a pure function of the collected
   * answers. Returning null skips the file.
   */
  content: string | ((answers: AddonAnswers) => string | null);
}

export interface AddonConditionContext {
  /** True when the target project uses SvelteKit. */
  kit: boolean;
}

export interface AddonMetadata {
  name: string;
  description: string;
  keywords?: readonly string[];
}

/** defineAddon-style add-on definition object. */
export interface SvAddon {
  id: string;
  metadata: AddonMetadata;
  /** Skip the add-on entirely when it returns false. */
  condition?: (context: AddonConditionContext) => boolean;
  questions?: readonly AddonQuestion[];
  files?: readonly AddonFile[];
  /** Install hint printed after scaffolding. */
  postInstall?: string | ((answers: AddonAnswers) => string);
}

/** Local defineAddon-style identity helper mirroring sv's exported helper. */
export function defineAddon(addon: SvAddon): SvAddon {
  return addon;
}
