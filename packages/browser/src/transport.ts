import { BROWSER_PATH, browserBody, endpoint, isRetryable, MAX_BODY_BYTES, type Envelope } from '@beats-analytics/core';

/** Events kept in memory while the server cannot be reached; the oldest are dropped first. */
export const MAX_BUFFER = 1000;

/** Longest body (characters) sent with `keepalive`, which is limited to 64 KiB. Leaves room for multi-byte characters. */
const MAX_CHARS = MAX_BODY_BYTES / 2;

export interface Transport {
  /** Queues an event; `now` sends the whole queue with `sendBeacon` (page hidden, link click). */
  _push(e: Envelope, now?: boolean): void;
  /** Sends queued events; `beacon` uses `sendBeacon` and does not wait for answers. */
  _flush(beacon?: boolean): void;
  /** Drops all queued events. */
  _clear(): void;
}

/**
 * The only module that talks to the server: `POST {apiHost}/e` with
 * `{"key", "consent", "events"}` as a `text/plain` body, which needs no
 * CORS preflight and is what `sendBeacon` sends. `consent` says whether the
 * server may use the browser's `distinct_id` and `session_id`.
 *
 * Failed requests (network error, 408, 429, 5xx) are retried with
 * exponential backoff (1 s, 2 s, 4 s, ... at most 30 s, with jitter) up to
 * `maxRetries` times; while the browser is offline the events wait for the
 * `online` event without using up retries. Other answers drop the batch.
 */
export function createTransport(
  apiHost: string,
  key: string,
  size: number,
  interval: number,
  maxRetries: number,
  consent: () => boolean,
): Transport {
  const url = endpoint(apiHost, BROWSER_PATH);
  const nav = navigator;
  let q: Envelope[] = [];
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let busy = false;
  let tries = 0;

  const later = (ms: number) => {
    timer ||= setTimeout(() => ((timer = 0), flush()), ms);
  };

  // Takes the next batch: at most `size` events. A body too long for a
  // keepalive request is sent as a normal request (and fails as a beacon,
  // then is sent with fetch).
  const take = (): [Envelope[], string] => {
    const batch = q.splice(0, size);
    return [batch, browserBody(key, consent(), batch)];
  };

  const post = (body: string) =>
    fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain' },
      keepalive: body.length < MAX_CHARS,
      // credentials stay at the default ("same-origin"): cross-origin requests carry no cookies
    }).then(
      (r) => r.status,
      () => 0,
    );

  function flush(beacon?: boolean): void {
    clearTimeout(timer);
    timer = 0;
    if (beacon) {
      while (q.length) {
        const body = take()[1];
        if (!nav.sendBeacon?.(url, body)) void post(body);
      }
      return;
    }
    const offline = () => nav.onLine === false;
    if (busy || !q.length || offline()) return; // the `online` listener resumes
    busy = true;
    const [batch, body] = take();
    void post(body).then((status) => {
      busy = false;
      if (status > 199 && status < 300) tries = 0;
      else if (isRetryable(status) && (offline() || tries < maxRetries)) {
        q = batch.concat(q).slice(-MAX_BUFFER);
        return offline() || later(Math.min(30_000, 1000 * 2 ** tries++) * (0.5 + Math.random() / 2));
      } else tries = 0;
      if (q.length) q.length < size ? later(interval) : flush();
    });
  }

  addEventListener('online', () => flush());

  return {
    _push(e, now) {
      if (q.push(e) > MAX_BUFFER) q.shift();
      if (now) flush(true);
      else if (q.length < size || tries) later(interval);
      else flush();
    },
    _flush: flush,
    _clear() {
      q = [];
    },
  };
}
