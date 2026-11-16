import { defineNuxtPlugin, useRequestHeaders, useRuntimeConfig, useState } from '#app';
import { DEFAULT_KEY_HEADER, KEY_STATE, requestKey } from './request-key.js';

/**
 * Per-request ingest key: when the SSR request carries the key header (the
 * revenexx platform sets `x-revenexx-beats-key` on shared theme Sites, one
 * deployment for many tenants), its value goes into the Nuxt payload and the
 * client plugin uses it instead of `beats.key`. `requestKeyHeader: false`
 * turns this off.
 */
export default defineNuxtPlugin(() => {
  const { requestKeyHeader } = (useRuntimeConfig().public.beats ?? {}) as { requestKeyHeader?: string | false };
  if (requestKeyHeader === false) return;
  const header = (requestKeyHeader || DEFAULT_KEY_HEADER).toLowerCase();
  const key = requestKey(useRequestHeaders([header])[header]);
  if (key) useState<string>(KEY_STATE, () => key).value = key;
});
