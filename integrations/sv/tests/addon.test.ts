import { describe, expect, it } from 'vitest';
import clicktrailAddon, { SVELTEKIT_PACKAGE } from '../src/addon.js';
import {
  generateConversionEndpoint,
  generateEnv,
  generateHooksServer,
  generateRootLayout,
} from '../src/generate.js';

describe('addon schema shape', () => {
  it('exposes id clicktrail and metadata', () => {
    expect(clicktrailAddon.id).toBe('clicktrail');
    expect(clicktrailAddon.metadata.name.length).toBeGreaterThan(0);
    expect(clicktrailAddon.metadata.description.length).toBeGreaterThan(0);
    expect(Array.isArray(clicktrailAddon.metadata.keywords)).toBe(true);
  });

  it('asks a siteId question with an empty default (fill in later)', () => {
    const questions = clicktrailAddon.questions ?? [];
    const siteId = questions.find((q) => q.id === 'siteId');
    expect(siteId).toBeDefined();
    expect(siteId!.question).toMatch(/site ID/i);
    expect(siteId!.default).toBe('');
    expect(siteId!.required).toBe(false);
  });

  it('applies only to SvelteKit projects', () => {
    expect(clicktrailAddon.condition?.({ kit: true })).toBe(true);
    expect(clicktrailAddon.condition?.({ kit: false })).toBe(false);
  });

  it('targets unique file paths', () => {
    const names = (clicktrailAddon.files ?? []).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => n.includes('hooks.server.ts'))).toBe(true);
    expect(names.some((n) => n.includes('+layout.svelte'))).toBe(true);
    expect(names.some((n) => n.includes('.env'))).toBe(true);
    expect(names.some((n) => n.includes('+server.ts'))).toBe(true);
  });

  it(`hints installing ${SVELTEKIT_PACKAGE} after scaffolding`, () => {
    const hint = typeof clicktrailAddon.postInstall === 'function'
      ? clicktrailAddon.postInstall({})
      : clicktrailAddon.postInstall;
    expect(hint).toContain(SVELTEKIT_PACKAGE);
  });
});

describe('generated file content', () => {
  const answers = { siteId: 'my-site' };

  it('hooks.server.ts wires the @vizuh/clicktrail-sveltekit handle', () => {
    const hooks = generateHooksServer(answers);
    expect(hooks).toContain("from '@vizuh/clicktrail-sveltekit'");
    expect(hooks).toContain('clicktrail({');
    expect(hooks).toContain('CLICKTRAIL_SITE_ID');
    expect(hooks).toContain("'my-site'");
  });

  it('root layout renders the ClickTrail component', () => {
    const layout = generateRootLayout();
    expect(layout).toContain('@vizuh/clicktrail-sveltekit/ClickTrail.svelte');
    expect(layout).toContain('<ClickTrail');
  });

  it('.env carries the CLICKTRAIL_SITE_ID placeholder', () => {
    const env = generateEnv({});
    expect(env).toContain('CLICKTRAIL_SITE_ID=your-site-id');
    expect(generateEnv(answers)).toContain('CLICKTRAIL_SITE_ID=my-site');
  });

  it('conversion endpoint calls trackConversion server-side', () => {
    const endpoint = generateConversionEndpoint(answers);
    expect(endpoint).toContain("@vizuh/clicktrail-sveltekit/server");
    expect(endpoint).toContain('trackConversion');
    expect(endpoint).toContain("event: 'lead'");
  });

  it('generators never throw on empty answers', () => {
    for (const gen of [generateHooksServer, generateEnv, generateConversionEndpoint, generateRootLayout]) {
      expect(() => gen()).not.toThrow();
      expect(gen().length).toBeGreaterThan(0);
    }
  });
});
