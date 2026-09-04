/**
 * Hidden-field form injection: ct_-prefixed fields appear after start(),
 * preserve/overwrite semantics, consent gating, MutationObserver lifecycle,
 * all against a minimal fake DOM (no jsdom dependency).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyEntryToForm,
  DEFAULT_FORM_FIELDS,
  FORM_FIELD_PREFIX,
  FORM_SELECTOR,
  HIDDEN_INPUT_SELECTOR,
  createFormInjector,
  defaultFormDocument,
  resolveInjectionEntries,
} from '../src/browser/form-injection.js';
import type {
  CtAttrNode,
  CtInputElement,
  DomMutationObserverLike,
  FormDomDocument,
  ObserverFactory,
} from '../src/browser/form-injection.js';
import { emptyAttribution } from '@vizuh/clicktrail-core';

// --- minimal fake DOM --------------------------------------------------------

class FakeInput implements CtInputElement {
  attrs = new Map<string, string>();
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
}

class FakeForm implements CtAttrNode {
  attrs = new Map<string, string>();
  children: FakeInput[] = [];
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  appendChild(node: CtInputElement): void {
    this.children.push(node as FakeInput);
  }
  removeChild(node: CtInputElement): void {
    const index = this.children.indexOf(node as FakeInput);
    if (index >= 0) this.children.splice(index, 1);
  }
  querySelectorAll(selector: string): CtAttrNode[] {
    if (selector !== HIDDEN_INPUT_SELECTOR) return [];
    return this.children.filter(
      (c) => c.getAttribute('type') === 'hidden',
    );
  }
  /** All hidden inputs including pre-existing ones. */
  hiddenInputs(): { name: string; value: string }[] {
    return this.querySelectorAll(HIDDEN_INPUT_SELECTOR).map((n) => ({
      name: n.getAttribute('name') ?? '',
      value: n.getAttribute('value') ?? '',
    }));
  }
}

class FakeDocument implements FormDomDocument {
  forms: FakeForm[] = [];
  body = { tag: 'body' };
  querySelectorAll(selector: string): FakeForm[] {
    return selector === FORM_SELECTOR ? [...this.forms] : [];
  }
  createElement(tagName: string): CtInputElement {
    expect(tagName).toBe('input');
    return new FakeInput();
  }
}

interface FakeObserver extends DomMutationObserverLike {
  trigger(): void;
  disconnectCalls: number;
}

/** Observer factory recording lifecycle; mutations fire via trigger(). */
function fakeObserverFactory(): ObserverFactory & { observers: FakeObserver[] } {
  const observers: FakeObserver[] = [];
  const factory = ((cb: () => void): FakeObserver => {
    let connected = true;
    const obs: FakeObserver = {
      observe: vi.fn(),
      disconnectCalls: 0,
      disconnect: () => {
        connected = false;
        obs.disconnectCalls += 1;
      },
      // Mirrors real MutationObserver semantics: no callbacks after
      // disconnect().
      trigger: () => {
        if (connected) cb();
      },
    };
    observers.push(obs);
    return obs;
  }) as unknown as ObserverFactory & { observers: FakeObserver[] };
  factory.observers = observers;
  return factory;
}

// --- helpers -----------------------------------------------------------------

const PAYLOAD = (): Record<string, string> => ({
  ...emptyAttribution(),
  ft_source: 'google',
  ft_medium: 'cpc',
  lt_medium: 'email',
  gclid: 'abc123',
});

const CONFIG = (overrides: Partial<Parameters<typeof createFormInjector>[0]> = {}) => ({
  consentAllowed: () => true,
  getPayload: PAYLOAD,
  getIdentity: () => ({ visitorId: 'v-1', sessionId: 's-1', sessionNumber: '2' }),
  ...overrides,
});

describe('resolveInjectionEntries (pure)', () => {
  it('maps canonical keys to ct_-prefixed names and skips empties', () => {
    const entries = resolveInjectionEntries({
      payload: PAYLOAD(),
      identity: {},
      fields: ['ft_source', 'ft_campaign', 'gclid'],
    });
    expect(entries).toEqual([
      [`${FORM_FIELD_PREFIX}ft_source`, 'google'],
      [`${FORM_FIELD_PREFIX}gclid`, 'abc123'],
    ]);
  });

  it('falls back to the identity snapshot for visitor/session keys', () => {
    const entries = resolveInjectionEntries({
      payload: emptyAttribution(),
      identity: { visitorId: 'v-9', sessionId: 's-9', sessionNumber: '7' },
      fields: ['visitor_id', 'session_id', 'session_number'],
    });
    expect(entries).toEqual([
      [`${FORM_FIELD_PREFIX}visitor_id`, 'v-9'],
      [`${FORM_FIELD_PREFIX}session_id`, 's-9'],
      [`${FORM_FIELD_PREFIX}session_number`, '7'],
    ]);
  });

  it('derives a stable trail field from visitor identity', () => {
    const entries = resolveInjectionEntries({
      payload: emptyAttribution(),
      identity: { visitorId: 'v-9' },
      fields: ['trail_id'],
    });
    expect(entries).toEqual([['ct_trail_id', 'trl_v-9']]);
  });

  it('payload value wins over identity fallback', () => {
    const payload = { ...emptyAttribution(), visitor_id: 'from-payload' };
    const entries = resolveInjectionEntries({
      payload,
      identity: { visitorId: 'from-identity' },
      fields: ['visitor_id'],
    });
    expect(entries).toEqual([['ct_visitor_id', 'from-payload']]);
  });
});

describe('applyEntryToForm (pure)', () => {
  it('creates a hidden input when none matches', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    const changed = applyEntryToForm(form, doc, 'ct_ft_source', 'google', false);
    expect(changed).toBe(true);
    expect(form.hiddenInputs()).toEqual([
      { name: 'ct_ft_source', value: 'google' },
    ]);
  });

  it('populates an existing EMPTY matching hidden field', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    applyEntryToForm(form, doc, 'ct_gclid', '', false);
    const changed = applyEntryToForm(form, doc, 'ct_gclid', 'xyz', false);
    expect(changed).toBe(true);
    expect(form.hiddenInputs()).toEqual([{ name: 'ct_gclid', value: 'xyz' }]);
  });

  it('preserves an existing NON-EMPTY value by default', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    applyEntryToForm(form, doc, 'ct_ft_source', 'manual-value', false);
    const changed = applyEntryToForm(form, doc, 'ct_ft_source', 'google', false);
    expect(changed).toBe(false);
    expect(form.hiddenInputs()).toEqual([
      { name: 'ct_ft_source', value: 'manual-value' },
    ]);
  });

  it('overwrites an existing NON-EMPTY value when overwrite is true', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    applyEntryToForm(form, doc, 'ct_ft_source', 'manual-value', true);
    applyEntryToForm(form, doc, 'ct_ft_source', 'google', true);
    expect(form.hiddenInputs()).toEqual([
      { name: 'ct_ft_source', value: 'google' },
    ]);
  });
});

describe('createFormInjector', () => {
  it('default field list covers summary touch fields, click IDs, and identity keys', () => {
    for (const key of [
      'ft_source', 'lt_touch_timestamp', 'ft_channel', 'lt_referrer',
      'gclid', 'fbclid', 'epik',
      'visitor_id', 'session_id', 'session_number',
      'trail_id',
    ]) {
      expect(DEFAULT_FORM_FIELDS).toContain(key);
    }
  });

  it('start() injects hidden ct_* fields into every present form', () => {
    const doc = new FakeDocument();
    doc.forms.push(new FakeForm(), new FakeForm());
    const injector = createFormInjector(CONFIG({ doc }));
    injector.start();
    for (const form of doc.forms) {
      const names = form.hiddenInputs().map((h) => h.name);
      expect(names).toContain('ct_ft_source');
      expect(names).toContain('ct_gclid');
      expect(names).toContain('ct_visitor_id');
      expect(names).toContain('ct_session_number');
    }
  });

  it('empty payload values produce NO injected inputs', () => {
    const doc = new FakeDocument();
    doc.forms.push(new FakeForm());
    createFormInjector(
      CONFIG({ doc, getPayload: () => emptyAttribution(), getIdentity: () => ({}) }),
    ).start();
    expect(doc.forms[0]!.hiddenInputs()).toEqual([]);
  });

  it('does not import a click ID from a cached form action', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    form.setAttribute('action', '/?gclid=visitor-a');
    doc.forms.push(form);

    createFormInjector(
      CONFIG({ doc, getPayload: () => emptyAttribution(), getIdentity: () => ({}) }),
    ).start();

    expect(form.getAttribute('action')).toBe('/?gclid=visitor-a');
    expect(form.hiddenInputs()).toEqual([]);
  });

  it('existing non-empty hidden fields are preserved unless overwrite', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    form.appendChild(new FakeInput());
    const existing = form.children[0]!;
    existing.setAttribute('type', 'hidden');
    existing.setAttribute('name', 'ct_ft_source');
    existing.setAttribute('value', 'hand-entered');
    doc.forms.push(form);
    createFormInjector(CONFIG({ doc })).start();
    // The hand-entered value survives...
    expect(form.hiddenInputs()).toContainEqual({
      name: 'ct_ft_source',
      value: 'hand-entered',
    });
    // ...while other fields still arrive around it.
    expect(form.hiddenInputs()).toContainEqual({
      name: 'ct_gclid',
      value: 'abc123',
    });
    // And no duplicate ct_ft_source input was added.
    expect(
      form.hiddenInputs().filter((h) => h.name === 'ct_ft_source'),
    ).toHaveLength(1);
  });

  it('overwrite: true replaces existing non-empty values', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    form.appendChild(new FakeInput());
    const existing = form.children[0]!;
    existing.setAttribute('type', 'hidden');
    existing.setAttribute('name', 'ct_ft_source');
    existing.setAttribute('value', 'hand-entered');
    doc.forms.push(form);
    createFormInjector(CONFIG({ doc, overwrite: true })).start();
    expect(form.hiddenInputs()).toContainEqual({
      name: 'ct_ft_source',
      value: 'google',
    });
  });

  it('clear() restores existing fields and removes fields it created', () => {
    const doc = new FakeDocument();
    const form = new FakeForm();
    const existing = new FakeInput();
    existing.setAttribute('type', 'hidden');
    existing.setAttribute('name', 'ct_gclid');
    existing.setAttribute('value', '');
    form.appendChild(existing);
    doc.forms.push(form);

    const injector = createFormInjector(CONFIG({ doc, fields: ['gclid', 'ft_source'] }));
    injector.start();
    expect(form.hiddenInputs()).toEqual([
      { name: 'ct_gclid', value: 'abc123' },
      { name: 'ct_ft_source', value: 'google' },
    ]);

    injector.clear();
    expect(form.hiddenInputs()).toEqual([{ name: 'ct_gclid', value: '' }]);
  });

  it('consent denied: no injection happens at all', () => {
    const doc = new FakeDocument();
    doc.forms.push(new FakeForm());
    let consentCalls = 0;
    const injector = createFormInjector(
      CONFIG({ doc, consentAllowed: () => { consentCalls += 1; return false; } }),
    );
    injector.start();
    expect(doc.forms[0]!.hiddenInputs()).toEqual([]);
    expect(consentCalls).toBeGreaterThan(0); // gate consulted per pass
  });

  it('late-added forms are injected via the observer; stop() disconnects it', () => {
    const doc = new FakeDocument();
    const observer = fakeObserverFactory();
    const injector = createFormInjector(CONFIG({ doc, observer }));
    injector.start();

    expect(observer.observers).toHaveLength(1);
    const obs = observer.observers[0]!;
    expect(obs.observe).toHaveBeenCalledWith(doc.body, { childList: true, subtree: true });

    // Late-added form appears before the initial pass ran its DOM writes?
    // The initial pass already covered doc.forms; simulate SPA-added form:
    const late = new FakeForm();
    doc.forms.push(late);
    obs.trigger();
    expect(late.hiddenInputs()).toContainEqual({ name: 'ct_ft_source', value: 'google' });

    injector.stop();
    expect(obs.disconnectCalls).toBe(1);

    const another = new FakeForm();
    doc.forms.push(another);
    obs.trigger();
    expect(another.hiddenInputs()).toEqual([]);
  });

  it('stop() is idempotent and safe before any observer existed', () => {
    const doc = new FakeDocument();
    const injector = createFormInjector(CONFIG({ doc, observer: null }));
    injector.start();
    expect(() => {
      injector.stop();
      injector.stop();
    }).not.toThrow();
  });

  it('no document (SSR): start()/stop() are inert no-ops', () => {
    const injector = createFormInjector(CONFIG({}));
    expect(() => {
      injector.start();
      injector.stop();
    }).not.toThrow();
  });

  it('defaultFormDocument() returns null outside a DOM environment', () => {
    // vitest node environment: no document global.
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(defaultFormDocument()).toBeNull();
  });
});
