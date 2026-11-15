import type { Envelope } from './types.js';

/**
 * The wire format of beats' own ingestion endpoints. Everything a client
 * needs to know about request paths and bodies lives here.
 */

/** Browser endpoint. The ingest key travels in the body; `text/plain` is accepted (sendBeacon, no CORS preflight). */
export const BROWSER_PATH = '/e';

/** Server-side endpoint. The ingest key travels in `Authorization: Bearer <key>`. */
export const SERVER_PATH = '/api/v1/events';

/** Largest request body a client sends at once (bytes). Beacons and keepalive requests are limited to 64 KiB. */
export const MAX_BODY_BYTES = 60_000;

/** Joins the API host and a path, without a double slash. */
export function endpoint(apiHost: string, path: string): string {
  return apiHost.replace(/\/+$/, '') + path;
}

/** Body of a browser request: `{"key": ..., "batch": [...]}`. */
export function browserBody(key: string, batch: Envelope[]): string {
  return JSON.stringify({ key, batch });
}

/** Body of a server-side request: `{"batch": [...]}`. */
export function serverBody(batch: Envelope[]): string {
  return JSON.stringify({ batch });
}

/** Whether a failed request should be retried: network errors, 408, 429 and 5xx. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
