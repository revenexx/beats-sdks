import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { BeatsOptions } from '@beats-analytics/browser';
import type { NuxtModule } from '@nuxt/schema';

export interface ModuleOptions extends Partial<BeatsOptions> {
  /** Also set `window.beats`, for consent managers and scripts outside Vue. Default false. */
  exposeGlobal?: boolean;
}

/**
 * Nuxt module. Options go to `runtimeConfig.public.beats`, so they can be
 * set at runtime with `NUXT_PUBLIC_BEATS_KEY`, `NUXT_PUBLIC_BEATS_API_HOST`, ...
 * The client runs only in the browser (client-only plugin).
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@beats-analytics/nuxt',
    configKey: 'beats',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    key: '',
    apiHost: '',
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const pub = nuxt.options.runtimeConfig.public as Record<string, unknown>;
    // values already in runtimeConfig (for example from .env) win over module options
    pub.beats = { ...options, ...(pub.beats as object | undefined) };
    addPlugin({ src: resolve('./runtime/plugin.client'), mode: 'client' });
    addImports({ name: 'useBeats', from: resolve('./runtime/composables') });
  },
});

export default module;
