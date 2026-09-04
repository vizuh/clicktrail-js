/**
 * Hidden-field form injection (Phase 2, work-queue #5).
 *
 * Contract (portable prompt "Forms and lead surfaces"):
 * - inject hidden attribution fields into present forms so server-side
 *   handlers receive the trail even without JS event collection
 * - populate matching hidden fields already present in the form
 * - overwrite-vs-preserve behavior for existing non-empty hidden values
 *   (preserve is the default; overwrite must be opted into)
 * - dynamic-form observation (MutationObserver) for late-added forms
 *
 * Field naming: input name = `ct_` + canonical payload key
 * (e.g. `ct_ft_source`, `ct_gclid`, `ct_visitor_id`).
 *
 * PROVISIONAL pending supervisor/plugin-source verification: the portable
 * prompt does not document exact input names. These were derived from plugin
 * source `includes/integrations/forms/class-abstract-form-adapter.php`
 * (`protected $field_prefix = 'ct_'`) combined with
 * `Attribution_Provider::get_field_mapping()` (the ft_/lt_ touch fields,
 * click IDs, visitor_id/session_id/session_number). The default field list
 * here is a SUMMARY subset; pass `fields` to match the full mapping.
 *
 * Determinism/seams: all DOM access enters via an injectable document root;
 * consent and payload/session values enter as callbacks. Nothing here runs
 * before start() and the observer lifecycle is tied to stop().
 */
import type { AttributionPayload } from '@vizuh/clicktrail-core';

// --- DOM seam ---------------------------------------------------------------

/** Node with attribute access (existing inputs, forms). */
export interface CtAttrNode {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
}

/** Element the injector creates (hidden input). */
export interface CtInputElement extends CtAttrNode {}

/** Form element contract the injector needs. */
export interface CtFormElement extends CtAttrNode {
  querySelectorAll(selector: string): CtAttrNode[];
  appendChild(node: CtInputElement): void;
  removeChild?(node: CtInputElement): void;
}

/**
 * Injectable document root. Tests supply a minimal fake DOM; the default
 * wraps globalThis.document and is only resolved inside start().
 */
export interface FormDomDocument {
  querySelectorAll(selector: string): CtFormElement[];
  createElement(tagName: string): CtInputElement;
  /** Observation target (document.body in the browser). */
  body: unknown;
}

/** Minimal MutationObserver-shaped seam so tests need no real observer. */
export interface DomMutationObserverLike {
  observe(target: unknown, init?: Record<string, unknown>): void;
  disconnect(): void;
}

export type ObserverFactory = (
  callback: () => void,
) => DomMutationObserverLike;

/**
 * Default document root over globalThis.document; null in SSR.
 * Structural types only: real DOM elements satisfy these shapes, and no
 * DOM lib types leak into the public surface.
 */
export function defaultFormDocument(): FormDomDocument | null {
  const doc = (globalThis as {
    document?: {
      querySelectorAll(selector: string): ArrayLike<CtAttrNode>;
      createElement(tagName: string): CtAttrNode;
      body: unknown;
    };
  }).document;
  if (!doc) return null;
  return {
    // Real DOM elements carry the full form/input surface; the structural
    // lookup types only guarantee attribute access.
    querySelectorAll: (selector) =>
      Array.from(doc.querySelectorAll(selector)) as CtFormElement[],
    createElement: (tagName) => doc.createElement(tagName) as CtInputElement,
    body: doc.body,
  };
}

/** Default observer factory over globalThis.MutationObserver; null in SSR. */
export function defaultObserverFactory(): ObserverFactory | null {
  const ctor = (globalThis as {
    MutationObserver?: new (
      cb: () => void,
    ) => DomMutationObserverLike;
  }).MutationObserver;
  if (!ctor) return null;
  return (callback) => new ctor(callback);
}

// --- config -----------------------------------------------------------------

export const FORM_SELECTOR = 'form';
export const HIDDEN_INPUT_SELECTOR = 'input[type="hidden"]';
/** Input-name prefix (see PROVISIONAL note at module top). */
export const FORM_FIELD_PREFIX = 'ct_';

/**
 * Default injected fields: ft_/lt_ summary touch fields + click IDs +
 * identity keys. Deliberately excludes the extended utm_source_platform /
 * utm_creative_format / utm_marketing_tactic fields to keep form payloads
 * small; pass an explicit `fields` list when a host needs full parity with
 * the plugin's get_field_mapping().
 */
export const DEFAULT_FORM_FIELDS: readonly string[] = [
  'ft_source',
  'ft_medium',
  'ft_campaign',
  'ft_term',
  'ft_content',
  'ft_channel',
  'ft_referrer',
  'ft_landing_page',
  'ft_touch_timestamp',
  'lt_source',
  'lt_medium',
  'lt_campaign',
  'lt_term',
  'lt_content',
  'lt_channel',
  'lt_referrer',
  'lt_landing_page',
  'lt_touch_timestamp',
  'gclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'ttclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'sccid',
  'epik',
  'trail_id',
  'visitor_id',
  'session_id',
  'session_number',
];

/** Session-shaped value provider (mirrors SessionSnapshot fields). */
export interface FormIdentityValues {
  visitorId?: string;
  trailId?: string;
  sessionId?: string;
  sessionNumber?: string;
}

export interface FormInjectionConfig {
  /** Canonical payload keys to inject. Default: {@link DEFAULT_FORM_FIELDS}. */
  fields?: readonly string[] | undefined;
  /**
   * Overwrite EXISTING NON-EMPTY hidden fields that share the input name.
   * Default false (preserve). Empty-valued matches are always populated.
   */
  overwrite?: boolean | undefined;
  /** Injectable document root. Default: globalThis.document wrapper. */
  doc?: FormDomDocument | undefined;
  /**
   * Observer factory for late-added forms. Default: globalThis.MutationObserver
   * wrapper on document.body. Pass null to disable dynamic watching.
   */
  observer?: ObserverFactory | null | undefined;
  /** Consent gate consulted before every injection pass. */
  consentAllowed: () => boolean;
  /** Current canonical flat payload. */
  getPayload: () => AttributionPayload;
  /** Identity values (visitor/session ids) resolved by the host instance. */
  getIdentity: () => FormIdentityValues;
}

export interface FormInjector {
  /** Inject into present forms and begin watching for late additions. */
  start(): void;
  /** Disconnect the observer. Idempotent. */
  stop(): void;
  clear(): void;
}

/**
 * PURE: resolve the name->value entries for one injection pass.
 * Empty values are skipped entirely (no empty hidden inputs are added);
 * identity keys fall back to the session snapshot when absent from the
 * canonical payload.
 */
export function resolveInjectionEntries(input: {
  payload: AttributionPayload;
  identity: FormIdentityValues;
  fields: readonly string[];
}): [string, string][] {
  const out: [string, string][] = [];
  for (const key of input.fields) {
    let value = input.payload[key] ?? '';
    if (!value) {
      if (key === 'visitor_id') value = input.identity.visitorId ?? '';
      else if (key === 'trail_id') value = input.identity.trailId ?? (input.identity.visitorId ? `trl_${input.identity.visitorId}` : '');
      else if (key === 'session_id') value = input.identity.sessionId ?? '';
      else if (key === 'session_number') value = input.identity.sessionNumber ?? '';
    }
    if (value) out.push([FORM_FIELD_PREFIX + key, value]);
  }
  return out;
}

/**
 * PURE: apply one entry to one form honoring preserve/overwrite semantics.
 * Returns true when the form was modified.
 */
export function applyEntryToForm(
  form: CtFormElement,
  doc: FormDomDocument,
  name: string,
  value: string,
  overwrite: boolean,
): boolean {
  const existing = form.querySelectorAll(HIDDEN_INPUT_SELECTOR);
  for (const node of existing) {
    if (node.getAttribute('name') !== name) continue;
    const current = node.getAttribute('value');
    if (current) {
      if (!overwrite || current === value) return false;
      node.setAttribute('value', value);
      return true;
    }
    node.setAttribute('value', value);
    return true;
  }
  const input = doc.createElement('input');
  input.setAttribute('type', 'hidden');
  input.setAttribute('name', name);
  input.setAttribute('value', value);
  form.appendChild(input);
  return true;
}

/**
 * Create the form injector. No DOM effects until start(); stop() severs the
 * observer. When no document is available (SSR), start()/stop() are no-ops.
 */
export function createFormInjector(config: FormInjectionConfig): FormInjector {
  const fields = config.fields ?? DEFAULT_FORM_FIELDS;
  const overwrite = config.overwrite ?? false;

  const owned = new Map<CtAttrNode, {
    form: CtFormElement;
    originalValue: string | null;
    appliedValue: string;
    created: boolean;
  }>();

  const injectOnce = (): void => {
    if (!config.consentAllowed()) return;
    const doc = config.doc;
    if (!doc) return;
    const entries = resolveInjectionEntries({
      payload: config.getPayload(),
      identity: config.getIdentity(),
      fields,
    });
    const forms = doc.querySelectorAll(FORM_SELECTOR);
    for (const form of forms) {
      for (const [name, value] of entries) {
        const before = form.querySelectorAll(HIDDEN_INPUT_SELECTOR);
        const existing = before.find((node) => node.getAttribute('name') === name);
        const originalValue = existing?.getAttribute('value') ?? null;
        if (!applyEntryToForm(form, doc, name, value, overwrite)) continue;
        const node = existing ?? form.querySelectorAll(HIDDEN_INPUT_SELECTOR)
          .find((candidate) => !before.includes(candidate) && candidate.getAttribute('name') === name);
        if (!node) continue;
        const prior = owned.get(node);
        if (prior) {
          prior.appliedValue = node.getAttribute('value') ?? value;
        } else {
          owned.set(node, {
            form,
            originalValue,
            appliedValue: node.getAttribute('value') ?? value,
            created: existing === undefined,
          });
        }
      }
    }
  };

  const clearOwned = (): void => {
    for (const [node, mutation] of owned) {
      if (node.getAttribute('value') !== mutation.appliedValue) continue;
      if (mutation.created) {
        const isChild = mutation.form.querySelectorAll(HIDDEN_INPUT_SELECTOR).includes(node);
        if (isChild && mutation.form.removeChild) {
          mutation.form.removeChild(node as CtInputElement);
        } else if (isChild) {
          node.setAttribute('value', '');
        }
        continue;
      }
      if (mutation.originalValue === null) {
        node.removeAttribute?.('value');
        if (node.getAttribute('value') !== null) node.setAttribute('value', '');
      } else {
        node.setAttribute('value', mutation.originalValue);
      }
    }
    owned.clear();
  };

  let observer: DomMutationObserverLike | null = null;

  return {
    start() {
      injectOnce();
      if (observer !== null) return;
      const factory = config.observer !== undefined ? config.observer : defaultObserverFactory();
      if (!factory) return;
      observer = factory(injectOnce);
      observer.observe(config.doc?.body ?? {}, { childList: true, subtree: true });
    },
    stop() {
      observer?.disconnect();
      observer = null;
      clearOwned();
    },
    clear() {
      clearOwned();
    },
  };
}
