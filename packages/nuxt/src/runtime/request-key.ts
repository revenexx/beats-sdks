/** Request header the revenexx platform sets to the tenant's ingest key on shared theme Sites. */
export const DEFAULT_KEY_HEADER = 'x-revenexx-beats-key';

/** `useState` key under which the server hands the per-request key to the browser. */
export const KEY_STATE = 'beats:key';

/**
 * A header value usable as an ingest key, or undefined: trimmed, printable
 * ASCII without spaces, at most 256 characters. Anything else is ignored
 * rather than written into the page.
 */
export function requestKey(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  if (!key || key.length > 256 || /[^\x21-\x7e]/.test(key)) return undefined;
  return key;
}
