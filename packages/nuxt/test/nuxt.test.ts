// @vitest-environment happy-dom
import { beats } from '@revenexx/beats-browser';
import { h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fileConfig from './beats-config-mock.js';
import { makeApp, state } from './nuxt-app-mock.js';

const kit = vi.hoisted(() => ({
  plugins: [] as unknown[],
  imports: [] as unknown[],
  templates: [] as { filename: string; getContents: () => string }[],
  files: [] as string[],
}));

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (def: unknown) => def,
  createResolver: () => ({ resolve: (p: string) => `/module/${p.replace('./', '')}` }),
  addPlugin: (p: unknown) => kit.plugins.push(p),
  addImports: (i: unknown) => kit.imports.push(...(Array.isArray(i) ? i : [i])),
  addTemplate: (t: { filename: string; getContents: () => string }) => kit.templates.push(t),
  findPath: async (paths: string[]) => paths.map((p) => kit.files.find((f) => f.startsWith(`${p}.`))).find(Boolean) ?? null,
}));

type Setup = { meta: { configKey: string }; setup: (o: object, nuxt: object) => Promise<void> };
const nuxtWith = (beats: object = {}) => ({ options: { srcDir: '/app/app', rootDir: '/app', runtimeConfig: { public: { beats } } } });

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { beats?: unknown }).beats;
});

describe('Nuxt module', () => {
  it('puts options in public runtime config and adds a client-only plugin and useBeats', async () => {
    const mod = (await import('../src/module.js')).default as unknown as Setup;
    expect(mod.meta.configKey).toBe('beats');
    const nuxt = nuxtWith({ key: 'bk_from_env' });
    await mod.setup(
      { key: 'bk_config', apiHost: 'https://beats.example.com', trackOutboundLinks: true, allowedQueryParams: ['utm_source', 'tab'] },
      nuxt,
    );
    expect(nuxt.options.runtimeConfig.public.beats).toEqual({
      key: 'bk_from_env',
      apiHost: 'https://beats.example.com',
      trackOutboundLinks: true,
      allowedQueryParams: ['utm_source', 'tab'],
    });
    expect(kit.plugins).toEqual([
      { src: '/module/runtime/plugin.server', mode: 'server' },
      { src: '/module/runtime/plugin.client', mode: 'client' },
    ]);
    expect(kit.imports).toEqual([
      { name: 'useBeats', from: '/module/runtime/composables' },
      { name: 'defineBeatsConfig', from: '/module/runtime/config' },
    ]);
    // no beats.config file: an empty config
    expect(kit.templates.at(-1)!.filename).toBe('beats.config.mjs');
    expect(kit.templates.at(-1)!.getContents()).toBe('export default {};\n');
  });

  it('re-exports beats.config from the source directory, keeping the config path out of runtime config', async () => {
    const mod = (await import('../src/module.js')).default as unknown as Setup;
    kit.files = ['/app/app/beats.config.ts'];
    const nuxt = nuxtWith();
    await mod.setup({ key: 'k', apiHost: 'https://beats.test' }, nuxt);
    expect(kit.templates.at(-1)!.getContents()).toBe('export { default } from "/app/app/beats.config.ts";\n');
    kit.files = ['/app/config/analytics.ts'];
    await mod.setup({ key: 'k', apiHost: 'https://beats.test', config: '/app/config/analytics' }, nuxt);
    expect(kit.templates.at(-1)!.getContents()).toBe('export { default } from "/app/config/analytics.ts";\n');
    expect(nuxt.options.runtimeConfig.public.beats).not.toHaveProperty('config');
    kit.files = [];
  });

  it('defineBeatsConfig returns the config as given', async () => {
    const { defineBeatsConfig } = await import('../src/runtime/config.js');
    const config = { sanitizeUrl: (u: string) => u };
    expect(defineBeatsConfig(config)).toBe(config);
  });
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** Lets the router settle, then fires Nuxt's `page:finish` and waits for the page view. */
async function finishPage() {
  await tick(5);
  await state.app.callHook('page:finish');
  await tick(5);
}

describe('Nuxt runtime plugin', () => {
  async function run(config: Record<string, unknown>, requestKey?: string) {
    state.config = { beats: config };
    state.app = makeApp();
    state.useState = requestKey === undefined ? {} : { 'beats:key': { value: requestKey } };
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
    await finishPage();
    await state.router!.push('/shop');
    await finishPage();
    expect(pageview).toHaveBeenCalledTimes(2);
  });

  it('sends the page view after page:finish and the head update, with the new title', async () => {
    vi.spyOn(beats, 'init').mockImplementation(() => {});
    vi.spyOn(beats, 'register').mockImplementation(() => {});
    const titles: string[] = [];
    vi.spyOn(beats, 'pageview').mockImplementation(() => void titles.push(document.title));
    document.title = 'Home';
    await run({ key: 'bk_1', apiHost: 'https://beats.test' });
    await finishPage();
    // what Nuxt 4's head plugin (registered before ours in a real app) does on
    // page:finish: the head is written after a zero timeout
    state.app.hooks['page:finish']!.unshift(() => void setTimeout(() => (document.title = 'Shop'), 0));
    await state.router!.push('/shop');
    await tick(20);
    // the page has not finished yet: no page view with the old title
    expect(titles).toEqual(['Home']);
    await state.app.callHook('page:finish');
    await tick(10);
    expect(titles).toEqual(['Home', 'Shop']);
  });

  it('sends the page view after a fallback when no page:finish comes (same page, new query)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.spyOn(beats, 'init').mockImplementation(() => {});
      vi.spyOn(beats, 'register').mockImplementation(() => {});
      const pageview = vi.spyOn(beats, 'pageview').mockImplementation(() => {});
      await run({ key: 'bk_1', apiHost: 'https://beats.test' });
      await vi.advanceTimersByTimeAsync(999);
      expect(pageview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5);
      expect(pageview).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes beforeSend and sanitizeUrl from beats.config and privacy options from runtime config', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    const register = vi.spyOn(beats, 'register').mockImplementation(() => {});
    const pageview = vi.spyOn(beats, 'pageview').mockImplementation(() => {});
    const beforeSend = (e: never) => e;
    const sanitizeUrl = (u: string) => u;
    Object.assign(fileConfig, { beforeSend, sanitizeUrl });
    try {
      await run({ key: 'bk_1', apiHost: 'https://beats.test', captureTitle: false, allowedQueryParams: ['tab'] });
    } finally {
      for (const k of Object.keys(fileConfig)) delete (fileConfig as Record<string, unknown>)[k];
    }
    expect(init).toHaveBeenCalledWith({
      key: 'bk_1',
      apiHost: 'https://beats.test',
      captureTitle: false,
      allowedQueryParams: ['tab'],
      beforeSend,
      sanitizeUrl,
      autoPageviews: false,
    });
    await finishPage();
    expect(pageview).toHaveBeenCalledWith({ route: '/', route_name: undefined });
    expect(register).toHaveBeenCalledWith({ route: '/', route_name: undefined });
  });

  it('routeProperties: false sends page views without route properties', async () => {
    vi.spyOn(beats, 'init').mockImplementation(() => {});
    const pageview = vi.spyOn(beats, 'pageview').mockImplementation(() => {});
    await run({ key: 'bk_1', apiHost: 'https://beats.test', routeProperties: false });
    await finishPage();
    expect(pageview).toHaveBeenCalledWith(undefined);
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

  it('stays quiet without a key when only the request key is missing, unless debug', async () => {
    const init = vi.spyOn(beats, 'init');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run({ apiHost: 'https://beats.test' });
    expect(init).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    await run({ apiHost: 'https://beats.test', debug: true });
    await run({ apiHost: 'https://beats.test', requestKeyHeader: false });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('prefers the per-request key from the payload over the configured one', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    await run({ key: 'bk_static', apiHost: 'https://beats.test' }, 'bk_tenant');
    expect(init).toHaveBeenCalledWith({ key: 'bk_tenant', apiHost: 'https://beats.test', autoPageviews: false });
  });

  it('initializes with only a per-request key and no configured one', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    await run({ key: '', apiHost: 'https://beats.test' }, 'bk_tenant');
    expect(init).toHaveBeenCalledWith({ key: 'bk_tenant', apiHost: 'https://beats.test', autoPageviews: false });
  });

  it('falls back to the configured key without a usable per-request key', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    await run({ key: 'bk_static', apiHost: 'https://beats.test' }, 'bk bad');
    expect(init).toHaveBeenCalledWith({ key: 'bk_static', apiHost: 'https://beats.test', autoPageviews: false });
  });

  it('ignores the per-request key with requestKeyHeader: false', async () => {
    const init = vi.spyOn(beats, 'init').mockImplementation(() => {});
    await run({ key: 'bk_static', apiHost: 'https://beats.test', requestKeyHeader: false }, 'bk_tenant');
    expect(init).toHaveBeenCalledWith({ key: 'bk_static', apiHost: 'https://beats.test', autoPageviews: false });
  });

  it('maps theme events to commerce events, once per event_id, unless turned off', async () => {
    vi.spyOn(beats, 'init').mockImplementation(() => {});
    const added = vi.spyOn(beats, 'productAdded').mockImplementation(() => {});
    const envelope = {
      schema: 'theme-events/1',
      event: 'add_to_cart',
      event_id: '00000000-0000-4000-8000-000000000001',
      currency: 'EUR',
      ecommerce: { items: [{ sku: 'LS-B16', name: 'LS B16', price_net: 4.18, quantity: 10 }] },
    };
    await run({ key: 'bk_1', apiHost: 'https://beats.test', autoPageviews: false });
    await state.app.callHook('revenexx:event', envelope);
    await state.app.callHook('revenexx:event', envelope);
    expect(added).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledWith({ items: [{ product_id: 'LS-B16', name: 'LS B16', price: 4.18, quantity: 10 }], currency: 'EUR' });

    added.mockClear();
    await run({ key: 'bk_1', apiHost: 'https://beats.test', autoPageviews: false, themeEvents: false });
    await state.app.callHook('revenexx:event', { ...envelope, event_id: 'other' });
    expect(added).not.toHaveBeenCalled();
  });

  it('does not listen to theme events when it cannot initialize', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const added = vi.spyOn(beats, 'productAdded').mockImplementation(() => {});
    await run({});
    await state.app.callHook('revenexx:event', { schema: 'theme-events/1', event: 'add_to_cart', event_id: 'x', ecommerce: { items: [] } });
    expect(added).not.toHaveBeenCalled();
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

describe('Nuxt server plugin', () => {
  async function run(config: Record<string, unknown>, headers: Record<string, string>) {
    state.config = { beats: config };
    state.headers = headers;
    state.useState = {};
    const plugin = (await import('../src/runtime/plugin.server.js')).default as unknown as () => void;
    plugin();
    return state.useState['beats:key']?.value;
  }

  it('puts the key header of the request into the payload', async () => {
    expect(await run({}, { 'x-revenexx-beats-key': 'bk_tenant' })).toBe('bk_tenant');
    expect(await run({}, { 'x-revenexx-beats-key': '  bk_trimmed ' })).toBe('bk_trimmed');
  });

  it('honours a custom header name and requestKeyHeader: false', async () => {
    expect(await run({ requestKeyHeader: 'X-Beats-Key' }, { 'x-beats-key': 'bk_custom' })).toBe('bk_custom');
    expect(await run({ requestKeyHeader: false }, { 'x-revenexx-beats-key': 'bk_tenant' })).toBeUndefined();
  });

  it('writes nothing without a usable header', async () => {
    expect(await run({}, {})).toBeUndefined();
    expect(await run({}, { 'x-revenexx-beats-key': '' })).toBeUndefined();
    expect(await run({}, { 'x-revenexx-beats-key': 'bk\u0000x' })).toBeUndefined();
    expect(await run({}, { 'x-revenexx-beats-key': 'a'.repeat(257) })).toBeUndefined();
  });
});
