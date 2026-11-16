import { beats as shared, type BeatsClient, type BeatsOptions } from '@revenexx/beats-browser';
import { hasInjectionContext, inject, nextTick, type App, type InjectionKey, type Plugin } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';

export type * from '@revenexx/beats-browser';

/** Injection key of the client. */
export const BEATS_KEY: InjectionKey<BeatsClient> = Symbol('beats');

export interface TrackRouterOptions {
  /**
   * Add the matched route pattern (`route`, for example `/customers/:id`) and
   * the route name (`route_name`) to the page view and, with `register`, to
   * every later event of the page, including its `$pageleave`. Default true.
   */
  routeProperties?: boolean;
  /**
   * Resolves when the new page has set its title, after a completed
   * navigation. Default: Vue's `nextTick`. The Nuxt module waits for
   * `page:finish` and the head update instead.
   */
  ready?: () => Promise<unknown>;
}

export interface BeatsVueOptions extends BeatsOptions, TrackRouterOptions {
  /** With a router, page views are sent from `router.afterEach` instead of the history API. */
  router?: Router;
  /** The client to use. Default: the shared `beats` instance of `@revenexx/beats-browser`. */
  client?: BeatsClient;
}

/**
 * The route pattern and name of a resolved route: `{ route: '/customers/:id',
 * route_name: 'customer' }`. The pattern is the path of the deepest matched
 * route record, so it holds no ids or tokens; Nuxt's `:id()` is written `:id`.
 */
export function routeProperties(to: Pick<RouteLocationNormalized, 'matched' | 'name'>): { route?: string; route_name?: string } {
  const path = to.matched[to.matched.length - 1]?.path;
  return {
    route: path?.replace(/\(\)/g, ''),
    route_name: to.name == null ? undefined : String(to.name),
  };
}

/**
 * Sends `$pageview` after each completed navigation of a Vue Router. Changes
 * of the hash alone are not counted, and neither is a `router.replace` that
 * keeps the path (a changed query or hash on the same page, such as the
 * replace a Nuxt page makes while it hydrates): the initial load counts once.
 * A push that changes only the query still counts. The page view is sent once
 * `ready` resolves (default: the next tick), so that the new page has set its title. With `routeProperties` (default),
 * the page view carries `route` and `route_name`, and they are registered as
 * super properties after it, so later events of the page carry them too
 * (the previous page's `$pageleave` keeps the previous route).
 */
export function trackRouter(router: Router, client: BeatsClient = shared, options: TrackRouterOptions = {}): () => void {
  let lastKey: string | undefined;
  let lastPath: string | undefined;
  // web and hash history mark the entry a replace wrote (memory history does not)
  const replaced = () => (router.options.history.state as { replaced?: unknown } | null | undefined)?.replaced === true;
  const send = (to: RouteLocationNormalized, replace: boolean) => {
    const key = to.fullPath.split('#')[0];
    if (key === lastKey) return;
    const samePage = to.path === lastPath;
    lastKey = key;
    lastPath = to.path;
    if (samePage && replace) return;
    const props = options.routeProperties === false ? undefined : routeProperties(to);
    void (options.ready ?? nextTick)().then(() => {
      client.pageview(props);
      if (props) client.register(props);
    });
  };
  const stop = router.afterEach((to, _from, failure) => {
    if (!failure) send(to, replaced());
  });
  // the initial navigation may be complete before this runs; if it was counted, this is the same page
  void router.isReady().then(() => send(router.currentRoute.value, true));
  return stop;
}

/**
 * The Vue plugin: `app.use(createBeatsPlugin({ key, apiHost, router }))`.
 * Initializes the client in the browser (nothing happens during server-side
 * rendering), provides it to `useBeats()` and as `$beats`.
 */
export function createBeatsPlugin(options: BeatsVueOptions): Plugin & { client: BeatsClient } {
  const { router, client = shared, routeProperties, ready, ...init } = options;
  return {
    client,
    install(app: App) {
      app.provide(BEATS_KEY, client);
      app.config.globalProperties.$beats = client;
      if (typeof window === 'undefined') return;
      client.init({ ...init, autoPageviews: router ? false : init.autoPageviews });
      if (router && init.autoPageviews !== false) trackRouter(router, client, { routeProperties, ready });
    },
  };
}

/** The client provided by the plugin, or the shared instance outside of a component. */
export function useBeats(): BeatsClient {
  return (hasInjectionContext() && inject(BEATS_KEY, null)) || shared;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $beats: BeatsClient;
  }
}
