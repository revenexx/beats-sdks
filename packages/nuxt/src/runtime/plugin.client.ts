import { beats, type BeatsOptions } from '@revenexx/beats-browser';
import { trackRouter } from '@revenexx/beats-vue';
import { defineNuxtPlugin, useRouter, useRuntimeConfig, useState } from '#app';
import { KEY_STATE, requestKey } from './request-key.js';
import { listenToThemeEvents, type PriceBasis } from './theme-events.js';

interface PluginOptions extends Partial<BeatsOptions> {
  exposeGlobal?: boolean;
  requestKeyHeader?: string | false;
  themeEvents?: boolean | { priceBasis?: PriceBasis };
}

export default defineNuxtPlugin((nuxtApp) => {
  const { exposeGlobal, requestKeyHeader, themeEvents, ...options } = (useRuntimeConfig().public.beats ?? {}) as PluginOptions;
  // the key the server read from the request wins over the configured one
  const fromRequest = requestKeyHeader === false ? undefined : requestKey(useState<string | undefined>(KEY_STATE).value);
  const key = fromRequest ?? options.key;
  if (!key || !options.apiHost) {
    console.warn('[beats] set beats.key and beats.apiHost (or NUXT_PUBLIC_BEATS_KEY and NUXT_PUBLIC_BEATS_API_HOST)');
  } else {
    // page views come from the router, not from the history API
    beats.init({ ...(options as BeatsOptions), key, autoPageviews: false });
    if (options.autoPageviews !== false) trackRouter(useRouter(), beats);
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
