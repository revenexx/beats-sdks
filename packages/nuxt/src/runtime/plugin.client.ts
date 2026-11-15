import { beats, type BeatsOptions } from '@revenexx/beats-browser';
import { trackRouter } from '@revenexx/beats-vue';
import { defineNuxtPlugin, useRuntimeConfig, useRouter } from '#app';

export default defineNuxtPlugin((nuxtApp) => {
  const { exposeGlobal, ...options } = (useRuntimeConfig().public.beats ?? {}) as Partial<BeatsOptions> & { exposeGlobal?: boolean };
  if (!options.key || !options.apiHost) {
    console.warn('[beats] set beats.key and beats.apiHost (or NUXT_PUBLIC_BEATS_KEY and NUXT_PUBLIC_BEATS_API_HOST)');
  } else {
    // page views come from the router, not from the history API
    beats.init({ ...(options as BeatsOptions), autoPageviews: false });
    if (options.autoPageviews !== false) trackRouter(useRouter(), beats);
  }
  // a consent manager can call `useNuxtApp().callHook('beats:consent', true)`
  nuxtApp.hook('beats:consent', (granted: boolean) => beats.consent(granted));
  if (exposeGlobal) (window as unknown as { beats: typeof beats }).beats = beats;
  return { provide: { beats } };
});
