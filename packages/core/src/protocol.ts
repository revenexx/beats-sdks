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

/** Most events in one request. */
export const MAX_EVENTS_PER_REQUEST = 1000;

/**
 * Body of a browser request: `{"key": ..., "consent": ..., "events": [...]}`.
 * The server uses the browser's `distinct_id` and `session_id` only with
 * `"consent": true` (or for projects that are not cookieless).
 */
export function browserBody(key: string, consent: boolean, events: Envelope[]): string {
  return JSON.stringify({ key, consent, events });
}

/** Body of a server-side request: `{"events": [...]}`. */
export function serverBody(events: Envelope[]): string {
  return JSON.stringify({ events });
}

/** Whether a failed request should be retried: network errors, 408, 429 and 5xx. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
