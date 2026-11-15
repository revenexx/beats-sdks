// @vitest-environment happy-dom
import { beats } from '@revenexx/beats-browser';
import { h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeApp, state } from './nuxt-app-mock.js';

const kit = vi.hoisted(() => ({ plugins: [] as unknown[], imports: [] as unknown[] }));

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (def: unknown) => def,
  createResolver: () => ({ resolve: (p: string) => `/module/${p.replace('./', '')}` }),
  addPlugin: (p: unknown) => kit.plugins.push(p),
  addImports: (i: unknown) => kit.imports.push(i),
}));

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { beats?: unknown }).beats;
});

describe('Nuxt module', () => {
  it('puts options in public runtime config and adds a client-only plugin and useBeats', async () => {
    const mod = (await import('../src/module.js')).default as unknown as {
      meta: { configKey: string };
      setup: (o: object, nuxt: object) => void;
    };
    expect(mod.meta.configKey).toBe('beats');
    const nuxt = { options: { runtimeConfig: { public: { beats: { key: 'bk_from_env' } } } } };
    mod.setup({ key: 'bk_config', apiHost: 'https://beats.example.com', trackOutboundLinks: true }, nuxt);
    expect(nuxt.options.runtimeConfig.public.beats).toEqual({
      key: 'bk_from_env',
      apiHost: 'https://beats.example.com',
      trackOutboundLinks: true,
    });
    expect(kit.plugins).toEqual([{ src: '/module/runtime/plugin.client', mode: 'client' }]);
    expect(kit.imports).toEqual([{ name: 'useBeats', from: '/module/runtime/composables' }]);
  });
});

describe('Nuxt runtime plugin', () => {
  async function run(config: Record<string, unknown>) {
    state.config = { beats: config };
    state.app = makeApp();
    state.router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => h('p') } },
        { path: '/shop', component: { render: () => h('p') } },
      ],
    });
    await state.router.push('/');
    const plugin = (await import('../src/runtime/plugin.client.js')).default as unknown as (app: unknown) => { provide: { beats: unknown } };
    return plugin(state.app);
  }

  it('initializes from runtime config, tracks route changes and provides $beats', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    const pageview = vi.spyOn(beats, 'pageview').mockImplementation(() => {});
    const result = await run({ key: 'bk_1', apiHost: 'https://beats.test', exposeGlobal: true });
    expect(init).toHaveBeenCalledWith({ key: 'bk_1', apiHost: 'https://beats.test', autoPageviews: false });
    expect(result.provide.beats).toBe(beats);
    expect((window as { beats?: unknown }).beats).toBe(beats);
    await new Promise((r) => setTimeout(r, 10));
    await state.router!.push('/shop');
    await new Promise((r) => setTimeout(r, 10));
    expect(pageview).toHaveBeenCalledTimes(2);
  });

  it('forwards the beats:consent hook to the client', async () => {
    vi.spyOn(beats, 'init').mockImplementation(() => {});
    const consent = vi.spyOn(beats, 'consent').mockImplementation(() => {});
    await run({ key: 'bk_1', apiHost: 'https://beats.test' });
    await state.app.callHook('beats:consent', true);
    await state.app.callHook('beats:consent', false);
    expect(consent.mock.calls).toEqual([[true], [false]]);
    expect((window as { beats?: unknown }).beats).toBeUndefined();
  });

  it('warns and does not initialize without key and apiHost', async () => {
    const init = vi.spyOn(beats, 'init');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run({});
    expect(init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('useBeats returns the provided client, or the shared one', async () => {
    const { useBeats } = await import('../src/runtime/composables.js');
    state.app = makeApp();
    expect(useBeats()).toBe(beats);
    const other = {};
    state.app.$beats = other;
    expect(useBeats()).toBe(other);
  });
});
