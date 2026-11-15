// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from '../src/loader.js';
import type { BeatsClient } from '../src/types.js';
import { makeClient, recordRequests, settle, silence } from './helpers.js';

function script(attrs: Record<string, string>) {
  const s = document.createElement('script');
  s.src = 'https://beats.example.com/beats.js';
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  Object.defineProperty(document, 'currentScript', { value: s, configurable: true });
}

afterEach(() => {
  silence();
  vi.unstubAllGlobals();
  delete (window as { beats?: unknown }).beats;
});

describe('script-tag loader', () => {
  it('reads options from data attributes and defaults apiHost to the script origin', () => {
    script({ 'data-key': 'bk_1', 'data-cookieless': 'false', 'data-track-outbound-links': 'true', 'data-session-timeout': '10', 'data-currency': 'EUR' });
    const { client } = makeClient({}, false);
    const init = vi.spyOn(client, 'init');
    boot(client);
    expect(init).toHaveBeenCalledWith({
      key: 'bk_1',
      apiHost: 'https://beats.example.com',
      cookieless: false,
      trackOutboundLinks: true,
      sessionTimeout: '10',
      currency: 'EUR',
    });
  });

  it('data-api overrides the API host', () => {
    script({ 'data-key': 'bk_1', 'data-api': 'https://collect.example.org' });
    const { client } = makeClient({}, false);
    const init = vi.spyOn(client, 'init');
    boot(client);
    expect(init.mock.calls[0]![0]).toMatchObject({ apiHost: 'https://collect.example.org' });
  });

  it('replays the stub queue after init, before the first page view, and replaces the stub', async () => {
    const r = recordRequests();
    script({ 'data-key': 'bk_1', 'data-batching': 'false' });
    const w = window as unknown as { beats: ((...a: unknown[]) => void) & { q?: unknown[] } & BeatsClient };
    // the documented stub
    // eslint-disable-next-line
    (w as any).beats = (w as any).beats || function () { ((w as any).beats.q = (w as any).beats.q || []).push(arguments); };
    w.beats('consent', true);
    w.beats('track', 'early', { a: 1 });
    const { client } = makeClient({}, false);
    boot(client);
    w.beats('track', 'late');
    w.beats.track('method');
    w.beats('unknownMethod');
    await settle(20);
    expect(r.names()).toEqual(['early', 'late', 'method', '$pageview']);
    expect(r.events().every((e) => typeof e.distinct_id === 'string')).toBe(true);
    expect(r.requests[0]!.url).toBe('https://beats.example.com/e');
  });

  it('does not init without data-key but keeps the queue for a queued init', async () => {
    const r = recordRequests();
    script({});
    (window as any).beats = Object.assign(() => {}, {
      q: [['init', { key: 'bk_2', apiHost: 'https://beats.test', batching: false, autoPageviews: false }], ['track', 'x']],
    });
    const { client } = makeClient({}, false);
    boot(client);
    await settle();
    expect(r.requests.map((x) => [x.body.key, x.body.batch[0]!.event])).toEqual([['bk_2', 'x']]);
  });
});
