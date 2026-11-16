import type { BeatsOptions } from '@revenexx/beats-browser';

/** The options of `beats.config.ts`: those that are functions and cannot live in runtime config. */
export type BeatsConfig = Pick<BeatsOptions, 'beforeSend' | 'sanitizeUrl'>;

/**
 * Typed helper for `beats.config.ts` (auto-imported):
 *
 * ```ts
 * export default defineBeatsConfig({
 *   sanitizeUrl: (url) => url.replace(/\/invitations\/[^/?#]+/, '/invitations/:token'),
 *   beforeSend: (event) => (event.event === 'debug_ping' ? null : event),
 * });
 * ```
 */
export function defineBeatsConfig(config: BeatsConfig): BeatsConfig {
  return config;
}
