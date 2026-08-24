import { describe, expect, it, vi } from 'vitest';
import { clicktrailAstro } from '../src/index.js';
import {
  CLIENT_CONFIG_GLOBAL,
  DEFAULT_PROXY_PATTERN,
  PROXY_CONFIG_GLOBAL,
} from '../src/config.js';

function runSetup(integration: ReturnType<typeof clicktrailAstro>) {
  const updateConfig = vi.fn();
  const injectScript = vi.fn();
  const injectRoute = vi.fn();
  integration.hooks['astro:config:setup']({
    config: {},
    updateConfig,
    injectScript,
    injectRoute,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return { updateConfig, injectScript, injectRoute };
}

describe('clicktrailAstro', () => {
  it('injects the client entrypoint as a page script in every mode', () => {
    const { injectScript } = runSetup(clicktrailAstro({ proxy: false }));
    expect(injectScript).toHaveBeenCalledWith({
      pattern: 'page',
      entrypoint: '@vizuh/clicktrail-astro/client',
    });
  });

  it('defines compile-time client + proxy globals', () => {
    const { updateConfig } = runSetup(
      clicktrailAstro({ siteId: 's1', workspaceId: 'w1', consentRequired: true, debug: true, proxy: false }),
    );
    const define = updateConfig.mock.calls[0]![0].vite!.define!;
    const clientCfg = JSON.parse(define[CLIENT_CONFIG_GLOBAL]!);
    expect(clientCfg).toMatchObject({ endpoint: '/api/clicktrail', siteId: 's1', workspaceId: 'w1', consentRequired: true, debug: true });
    expect(typeof define[PROXY_CONFIG_GLOBAL]).toBe('string');
  });

  it('injects the default proxy route when upstream is given', () => {
    const { injectRoute } = runSetup(
      clicktrailAstro({ proxy: { upstream: 'https://collector.example.com/v1/events' } }),
    );
    expect(injectRoute).toHaveBeenCalledWith({
      pattern: DEFAULT_PROXY_PATTERN,
      entrypoint: '@vizuh/clicktrail-astro/proxy',
      prerender: false,
    });
  });

  it('honors a custom proxy pattern and forwarded headers', () => {
    const { injectRoute } = runSetup(
      clicktrailAstro({ proxy: { pattern: '/api/ct-collect', upstream: 'https://up.example.com' } }),
    );
    expect(injectRoute.mock.calls[0]![0].pattern).toBe('/api/ct-collect');
  });

  it('skips route injection for an absolute endpoint', () => {
    const { injectRoute } = runSetup(
      clicktrailAsto_absHelper(),
    );
    expect(injectRoute).not.toHaveBeenCalled();
  });

  it('proxy: false disables the route entirely', () => {
    const { injectRoute } = runSetup(clicktrailAstro({ proxy: false }));
    expect(injectRoute).not.toHaveBeenCalled();
  });

  it('throws a TypeError when the default proxy lacks an upstream', () => {
    expect(() => clicktrailAstro()).toThrow(TypeError);
    expect(() => clicktrailAstro()).toThrow(/proxy\.upstream/);
  });

  it('exposes Astro catalog metadata via package shape (name + hooks)', () => {
    const integration = clicktrailAstro({ proxy: false });
    expect(integration.name).toBe('@vizuh/clicktrail-astro');
    expect(typeof integration.hooks['astro:config:setup']).toBe('function');
  });
});

function clicktrailAsto_absHelper() {
  return clicktrailAstro({ endpoint: 'https://collector.example.com/v1/events' });
}
