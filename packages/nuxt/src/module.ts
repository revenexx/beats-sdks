import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { BeatsOptions } from '@revenexx/beats-browser';
import type { NuxtModule } from '@nuxt/schema';

export interface ModuleOptions extends Partial<BeatsOptions> {
  /** Also set `window.beats`, for consent managers and scripts outside Vue. Default false. */
  exposeGlobal?: boolean;
  /**
   * Request header whose value, when the SSR request carries it, is used as
   * the ingest key of that page instead of `key`. The revenexx platform sets
   * `x-revenexx-beats-key` on shared theme Sites (one deployment, many
   * tenants). Only use it behind a proxy that sets the header itself and
   * drops copies sent by clients. `false` turns it off. Default
   * `'x-revenexx-beats-key'`.
   */
  requestKeyHeader?: string | false;
  /**
   * Send beats commerce events for the revenexx theme event stream
   * (`theme-events/1`, the `revenexx:event` hook and DOM event), so a theme
   * needs no beats calls of its own. `priceBasis` picks net (default) or
   * gross prices. `false` turns it off. Default true.
   */
  themeEvents?: boolean | { priceBasis?: 'net' | 'gross' };
}

/**
 * Nuxt module. Options go to `runtimeConfig.public.beats`, so they can be
 * set at runtime with `NUXT_PUBLIC_BEATS_KEY`, `NUXT_PUBLIC_BEATS_API_HOST`, ...
 * The client runs only in the browser (client-only plugin); a server plugin
 * passes a per-request ingest key from the SSR request to it.
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@revenexx/beats-nuxt',
    configKey: 'beats',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    key: '',
    apiHost: '',
    requestKeyHeader: 'x-revenexx-beats-key',
    themeEvents: true,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const pub = nuxt.options.runtimeConfig.public as Record<string, unknown>;
    // values already in runtimeConfig (for example from .env) win over module options
    pub.beats = { ...options, ...(pub.beats as object | undefined) };
    addPlugin({ src: resolve('./runtime/plugin.server'), mode: 'server' });
    addPlugin({ src: resolve('./runtime/plugin.client'), mode: 'client' });
    addImports({ name: 'useBeats', from: resolve('./runtime/composables') });
  },
});

export default module;
