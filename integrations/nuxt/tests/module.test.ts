import { describe, expect, it, vi } from 'vitest';
import defineClicktrailModule, { defineClicktrailModule as named } from '../src/index.js';
import {
  CLIENT_PLUGIN_ENTRY,
  DEFAULT_PROXY_PATTERN,
  MODULE_NAME,
  PROXY_HANDLER_ENTRY,
} from '../src/config.js';

function makeNuxt() {
  return {
    options: { runtimeConfig: {} as Record<string, unknown> },
    addPlugin: vi.fn(),
    addServerHandler: vi.fn(),
  };
}

function setup(options: Parameters<typeof defineClicktrailModule>[0] = {}, fromConfig?: unknown) {
  const mod = defineClicktrailModule(options);
  const nuxt = makeNuxt();
  mod.setup(fromConfig, nuxt as never);
  const rc = nuxt.options.runtimeConfig;
  return { nuxt, rc, publicCfg: (rc.public as Record<string, unknown>)['clicktrail'] as Record<string, unknown>, serverCfg: rc['clicktrailServer'] as Record<string, unknown> | undefined };
}

describe('module factory shape', () => {
  it('exposes a Nuxt module-object shape with name, configKey, version, setup', () => {
    const mod = defineClicktrailModule({ firstPartyProxy: false });
    expect(mod.name).toBe(MODULE_NAME);
    expect(mod.configKey).toBe('clicktrail');
    expect(mod.version).toBe('0.1.0-rc.4');
    expect(typeof mod.setup).toBe('function');
    expect(typeof named).toBe('function');
    expect(named).toBe(defineClicktrailModule);
  });
});

describe('runtimeConfig population', () => {
  it('writes client defaults into public.clicktrail and a null server proxy', () => {
    const { publicCfg, serverCfg } = setup({ firstPartyProxy: false });
    expect(publicCfg).toEqual({
      endpoint: '/api/clicktrail',
      consentRequired: false,
      trackPageViews: true,
      captureClickIds: true,
      debug: false,
    });
    expect(serverCfg).toEqual({ proxy: null });
  });

  it('carries option overrides into the public slice', () => {
    const { publicCfg } = setup(
      {
        siteId: 's1',
        workspaceId: 'w1',
        endpoint: '/api/ct',
        consentRequired: true,
        trackPageViews: false,
        captureClickIds: false,
        debug: true,
        firstPartyProxy: false,
      },
      {},
    );
    expect(publicCfg).toEqual({
      endpoint: '/api/ct',
      siteId: 's1',
      workspaceId: 'w1',
      consentRequired: true,
      trackPageViews: false,
      captureClickIds: false,
      debug: true,
    });
  });

  it('falls back to options passed via the clicktrail config key', () => {
    const { publicCfg } = setup({ firstPartyProxy: false }, { siteId: 'cfg-site' });
    expect(publicCfg['siteId']).toBe('cfg-site');
  });

  it('factory options win over config-key options', () => {
    const { publicCfg } = setup(
      { firstPartyProxy: false, siteId: 'factory' },
      { siteId: 'config' },
    );
    expect(publicCfg['siteId']).toBe('factory');
  });

  it('creates the public runtime-config bucket when missing', () => {
    const { nuxt } = setup({ firstPartyProxy: false });
    expect(nuxt.options.runtimeConfig.public).toBeTypeOf('object');
  });

  it('writes validated proxy settings into clicktrailServer.proxy', () => {
    const { serverCfg } = setup({
      firstPartyProxy: { upstream: 'https://collector.example.com/v1/events', forwardHeaders: ['user-agent'] },
    });
    expect(serverCfg).toEqual({
      proxy: { upstream: 'https://collector.example.com/v1/events', forwardHeaders: ['user-agent'] },
    });
  });

  it('marks firstPartyProxy: true as pending upstream resolution', () => {
    const { serverCfg } = setup({ firstPartyProxy: true });
    expect((serverCfg!.proxy as Record<string, unknown>).upstream).toBe('');
  });
});

describe('plugin + route registration rules', () => {
  it('always registers the client plugin in client mode', () => {
    const { nuxt } = setup({ firstPartyProxy: false });
    expect(nuxt.addPlugin).toHaveBeenCalledWith({ src: CLIENT_PLUGIN_ENTRY, mode: 'client' });
  });

  it('registers the default route for an object-form proxy with upstream', () => {
    const { nuxt } = setup({
      firstPartyProxy: { upstream: 'https://up.example.com/v1/events' },
    });
    expect(nuxt.addServerHandler).toHaveBeenCalledWith({
      route: DEFAULT_PROXY_PATTERN,
      handler: PROXY_HANDLER_ENTRY,
    });
  });

  it('honors a custom proxy pattern', () => {
    const { nuxt } = setup({
      firstPartyProxy: { pattern: '/api/ct-collect', upstream: 'https://up.example.com' },
    });
    expect(nuxt.addServerHandler.mock.calls[0]![0].route).toBe('/api/ct-collect');
  });

  it('registers the route for firstPartyProxy: true', () => {
    const { nuxt } = setup({ firstPartyProxy: true });
    expect(nuxt.addServerHandler).toHaveBeenCalledTimes(1);
  });

  it('skips route registration when firstPartyProxy is false', () => {
    const { nuxt } = setup({ firstPartyProxy: false }, {});
    expect(nuxt.addServerHandler).not.toHaveBeenCalled();
  });

  it('skips route registration for an absolute endpoint', () => {
    const { nuxt } = setup({ endpoint: 'https://collector.example.com/v1/events', firstPartyProxy: { upstream: 'https://x.example.com' } });
    expect(nuxt.addServerHandler).not.toHaveBeenCalled();
  });

  it('throws a TypeError when the default-enabled proxy lacks an upstream', () => {
    expect(() => defineClicktrailModule()).toThrow(TypeError);
    expect(() => defineClicktrailModule()).toThrow(/firstPartyProxy\.upstream/);
  });

  it('throws a TypeError when the object form lacks an upstream', () => {
    expect(() =>
      defineClicktrailModule({ firstPartyProxy: { pattern: '/x' } as never }),
    ).toThrow(/firstPartyProxy\.upstream/);
  });
});
