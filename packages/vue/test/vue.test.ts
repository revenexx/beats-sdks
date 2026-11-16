// @vitest-environment happy-dom
import { createBeats } from '@revenexx/beats-browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import { createSSRApp } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBeatsPlugin, trackRouter, useBeats } from '../src/index.js';

const settle = () => new Promise((r) => setTimeout(r, 10));

function fakeClient() {
  const c = createBeats();
  const init = vi.spyOn(c, 'init');
  const pageview = vi.spyOn(c, 'pageview').mockImplementation(() => {});
  return { c, init, pageview };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Vue plugin', () => {
  it('initializes the client and provides it to useBeats and $beats', () => {
    const { c, init } = fakeClient();
    let fromSetup: unknown;
    const App = defineComponent({
      setup() {
        fromSetup = useBeats();
        return () => h('div');
      },
    });
    const app = createApp(App);
    app.use(createBeatsPlugin({ key: 'bk_1', apiHost: 'https://beats.test', client: c }));
    app.mount(document.createElement('div'));
    expect(init).toHaveBeenCalledWith({ key: 'bk_1', apiHost: 'https://beats.test', autoPageviews: undefined });
    expect(fromSetup).toBe(c);
    expect(app.config.globalProperties.$beats).toBe(c);
    app.unmount();
  });

  it('with a router: no history API patching, page views after navigation, hash changes ignored', async () => {
    const { c, init, pageview } = fakeClient();
    const Page = defineComponent({ render: () => h('p') });
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: Page },
        { path: '/products/:id', component: Page },
      ],
    });
    const app = createApp(defineComponent({ render: () => h('div') }));
    app.use(router);
    app.use(createBeatsPlugin({ key: 'bk_1', apiHost: 'https://beats.test', client: c, router }));
    app.mount(document.createElement('div'));
    await router.isReady();
    await settle();
    expect(init.mock.calls[0]![0].autoPageviews).toBe(false);
    expect(pageview).toHaveBeenCalledTimes(1);
    await router.push('/products/1');
    await settle();
    await router.push('/products/1#reviews');
    await router.push('/products/2');
    await settle();
    expect(pageview).toHaveBeenCalledTimes(3);
    app.unmount();
  });

  it('autoPageviews: false with a router sends no page views', async () => {
    const { c, pageview } = fakeClient();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => h('p') } }] });
    const app = createApp({ render: () => h('div') });
    app.use(router);
    app.use(createBeatsPlugin({ key: 'k', apiHost: 'https://beats.test', client: c, router, autoPageviews: false }));
    app.mount(document.createElement('div'));
    await router.isReady();
    await settle();
    expect(pageview).not.toHaveBeenCalled();
  });

  it('does not count failed navigations', async () => {
    const { c, pageview } = fakeClient();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => h('p') } },
        { path: '/blocked', component: { render: () => h('p') }, beforeEnter: () => false },
      ],
    });
    await router.push('/');
    trackRouter(router, c);
    await settle();
    await router.push('/blocked');
    await nextTick();
    await settle();
    expect(pageview).toHaveBeenCalledTimes(1);
  });

  it('adds the route pattern and name to page views, page leave and later events', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    const bodies: { key: string; events: { event: string; url: string; properties: Record<string, unknown> }[] }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(null, { status: 200 });
      }),
    );
    try {
      const c = createBeats();
      const Page = defineComponent({ render: () => h('p') });
      const router = createRouter({
        history: createWebHistory(),
        routes: [
          { path: '/', name: 'home', component: Page },
          { path: '/customers/:id()', name: 'customer', component: Page },
          { path: '/orders', component: Page },
        ],
      });
      const app = createApp({ render: () => h('div') });
      app.use(router);
      app.use(createBeatsPlugin({ key: 'bk_route', apiHost: 'https://beats.test', client: c, router, batching: false }));
      app.mount(document.createElement('div'));
      await router.push('/');
      await settle();
      await router.push('/customers/42?tab=orders');
      await settle();
      c.track('note_added');
      await router.push('/orders');
      await settle();
      // clients of earlier tests may send to the same stub
      const events = bodies.filter((b) => b.key === 'bk_route').flatMap((b) => b.events);
      expect(events.map((e) => [e.event, e.properties.route, e.properties.route_name])).toEqual([
        ['$pageview', '/', 'home'],
        ['$pageleave', '/', 'home'],
        ['$pageview', '/customers/:id', 'customer'],
        ['note_added', '/customers/:id', 'customer'],
        ['$pageleave', '/customers/:id', 'customer'],
        ['$pageview', '/orders', undefined],
      ]);
      // the id stays in the URL path (use sanitizeUrl for that); the query string does not
      expect(events[2]!.url).toMatch(/\/customers\/42$/);
      app.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('routeProperties: false sends page views without route properties', async () => {
    const { c, pageview } = fakeClient();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => h('p') } }] });
    await router.push('/');
    trackRouter(router, c, { routeProperties: false });
    await settle();
    expect(pageview).toHaveBeenCalledWith(undefined);
  });

  it('useBeats outside a component returns the shared client', () => {
    expect(typeof useBeats().track).toBe('function');
  });
});

describe('Vue plugin during server-side rendering', () => {
  it('does not initialize without window', async () => {
    const { c, init } = fakeClient();
    const win = globalThis.window;
    vi.stubGlobal('window', undefined);
    try {
      const app = createSSRApp({ render: () => h('div') });
      app.use(createBeatsPlugin({ key: 'k', apiHost: 'https://beats.test', client: c }));
      expect(init).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('window', win);
      vi.unstubAllGlobals();
    }
  });
});
