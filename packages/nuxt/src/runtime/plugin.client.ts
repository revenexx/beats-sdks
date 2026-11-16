import { beats, type BeatsOptions } from '@revenexx/beats-browser';
import { trackRouter } from '@revenexx/beats-vue';
import { defineNuxtPlugin, useRouter, useRuntimeConfig, useState } from '#app';
import fileConfig from '#build/beats.config.mjs';
import type { BeatsConfig } from './config.js';
import { pageReady } from './page-ready.js';
import { KEY_STATE, requestKey } from './request-key.js';
import { listenToThemeEvents, type PriceBasis } from './theme-events.js';

interface PluginOptions extends Partial<BeatsOptions> {
  exposeGlobal?: boolean;
  requestKeyHeader?: string | false;
  themeEvents?: boolean | { priceBasis?: PriceBasis };
  routeProperties?: boolean;
}

export default defineNuxtPlugin((nuxtApp) => {
  const { exposeGlobal, requestKeyHeader, themeEvents, routeProperties, ...options } = (useRuntimeConfig().public.beats ??
    {}) as PluginOptions;
  // functions from beats.config.ts (runtime config holds only JSON values)
  const { beforeSend, sanitizeUrl } = (fileConfig ?? {}) as BeatsConfig;
  if (beforeSend) options.beforeSend = beforeSend;
  if (sanitizeUrl) options.sanitizeUrl = sanitizeUrl;
  // the key the server read from the request wins over the configured one
  const fromRequest = requestKeyHeader === false ? undefined : requestKey(useState<string | undefined>(KEY_STATE).value);
  const key = fromRequest ?? options.key;
  if (!key || !options.apiHost) {
    // With the request key header on, a page without a key is expected (a host
    // that belongs to no beats project, such as a preview): only say so in debug.
    if (!options.apiHost || requestKeyHeader === false || options.debug)
      console.warn('[beats] set beats.key and beats.apiHost (or NUXT_PUBLIC_BEATS_KEY and NUXT_PUBLIC_BEATS_API_HOST)');
  } else {
    // page views come from the router, not from the history API, once the new page's title is applied
    beats.init({ ...(options as BeatsOptions), key, autoPageviews: false });
    if (options.autoPageviews !== false) trackRouter(useRouter(), beats, { routeProperties, ready: () => pageReady(nuxtApp) });
    if (themeEvents !== false) {
      const basis = typeof themeEvents === 'object' && themeEvents.priceBasis === 'gross' ? 'gross' : 'net';
      listenToThemeEvents(nuxtApp, beats, basis, window);
    }
  }
  // a consent manager can call `useNuxtApp().callHook('beats:consent', true)`
  nuxtApp.hook('beats:consent', (granted: boolean) => beats.consent(granted));
  if (exposeGlobal) (window as unknown as { beats: typeof beats }).beats = beats;
  return { provide: { beats } };
});
