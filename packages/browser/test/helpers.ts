import { vi } from 'vitest';
import type { Envelope } from '@beats-analytics/core';
import { createClient, type Ctx, type Plugin } from '../src/client.js';
import { clicks } from '../src/plugins/clicks.js';
import { commerce } from '../src/plugins/commerce.js';
import { people } from '../src/plugins/people.js';
import { privacy } from '../src/plugins/privacy.js';
import { vitals } from '../src/plugins/vitals.js';
import type { BeatsClient, BeatsOptions } from '../src/types.js';

export interface Request {
  url: string;
  body: { key: string; consent: boolean; events: Envelope[] };
  beacon: boolean;
}

const live: Ctx[] = [];

/** happy-dom reports an automated browser, which the client ignores; the tests pretend to be a person. */
export function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { value, configurable: true });
}
setWebdriver(false);

/** Records requests made with fetch and sendBeacon. */
export function recordRequests(status: () => number = () => 200) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string), beacon: false });
    const s = status();
    if (s === 0) throw new TypeError('network error');
    return new Response(null, { status: s });
  });
  vi.stubGlobal('fetch', fetch);
  const sendBeacon = vi.fn((url: string, body: string) => {
    requests.push({ url, body: JSON.parse(body), beacon: true });
    return true;
  });
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
  return {
    requests,
    fetch,
    sendBeacon,
    events: () => requests.flatMap((r) => r.body.events),
    names: () => requests.flatMap((r) => r.body.events.map((e) => e.event)),
  };
}

/** Stops the clients of earlier tests from sending (their listeners stay on the window). */
export function silence() {
  for (const c of live.splice(0)) {
    c._s._x = true;
    c._t?._clear();
  }
}

/** A full client whose internals the test can reach; clients of earlier tests are silenced. */
export function makeClient(options: Partial<BeatsOptions> = {}, init = true) {
  silence();
  let ctx!: Ctx;
  const expose: Plugin = (c) => {
    ctx = c;
    live.push(c);
  };
  const client = createClient<BeatsClient>([privacy, people, commerce, clicks, vitals, expose]);
  if (init) client.init({ key: 'bk_test', apiHost: 'https://beats.test', autoPageviews: false, batching: false, ...options });
  return { client, ctx };
}

/** Lets pending timers and promises run. */
export const settle = (ms = 5) => new Promise((r) => setTimeout(r, ms));

export function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
  window.dispatchEvent(new Event('visibilitychange'));
}
