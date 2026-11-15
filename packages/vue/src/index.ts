import { beats as shared, type BeatsClient, type BeatsOptions } from '@beats-analytics/browser';
import { hasInjectionContext, inject, nextTick, type App, type InjectionKey, type Plugin } from 'vue';
import type { Router } from 'vue-router';

export type * from '@beats-analytics/browser';

/** Injection key of the client. */
export const BEATS_KEY: InjectionKey<BeatsClient> = Symbol('beats');

export interface BeatsVueOptions extends BeatsOptions {
  /** With a router, page views are sent from `router.afterEach` instead of the history API. */
  router?: Router;
  /** The client to use. Default: the shared `beats` instance of `@beats-analytics/browser`. */
  client?: BeatsClient;
}

/**
 * Sends `$pageview` after each completed navigation of a Vue Router. Changes
 * of the hash alone are not counted. The page view is sent on the next tick,
 * so that the new page has set its title.
 */
export function trackRouter(router: Router, client: BeatsClient = shared): () => void {
  let last: string | undefined;
  const send = (fullPath: string) => {
    const key = fullPath.split('#')[0];
    if (key === last) return;
    last = key;
    void nextTick(() => client.pageview());
  };
  const stop = router.afterEach((to, _from, failure) => {
    if (!failure) send(to.fullPath);
  });
  // the initial navigation may be complete before this runs
  void router.isReady().then(() => send(router.currentRoute.value.fullPath));
  return stop;
}

/**
 * The Vue plugin: `app.use(createBeatsPlugin({ key, apiHost, router }))`.
 * Initializes the client in the browser (nothing happens during server-side
 * rendering), provides it to `useBeats()` and as `$beats`.
 */
export function createBeatsPlugin(options: BeatsVueOptions): Plugin & { client: BeatsClient } {
  const { router, client = shared, ...init } = options;
  return {
    client,
    install(app: App) {
      app.provide(BEATS_KEY, client);
      app.config.globalProperties.$beats = client;
      if (typeof window === 'undefined') return;
      client.init({ ...init, autoPageviews: router ? false : init.autoPageviews });
      if (router && init.autoPageviews !== false) trackRouter(router, client);
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
