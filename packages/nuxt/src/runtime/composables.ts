import { beats, type BeatsClient } from '@revenexx/beats-browser';
import { useNuxtApp } from '#app';

/**
 * The beats client. During server-side rendering it returns the shared
 * client, whose calls do nothing there.
 */
export function useBeats(): BeatsClient {
  return (useNuxtApp().$beats as BeatsClient | undefined) ?? beats;
}
