// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import golden from '../../core/test/golden/commerce.json' with { type: 'json' };
import { KEYS } from '../src/client.js';
import { createBeats } from '../src/index.js';
import { makeClient, recordRequests, setVisibility, settle, silence } from './helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function storageKeys() {
  return [...Object.keys(localStorage), ...Object.keys(sessionStorage)].sort();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(';').forEach((c) => (document.cookie = `${c.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`));
  history.replaceState(null, '', '/start');
  setVisibility('visible');
});

afterEach(() => {
  silence();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('envelope', () => {
  it('sends the envelope fields of docs/events.md', async () => {
    const r = recordRequests();
    document.title = 'Start';
    const { client } = makeClient();
    client.track('signup', { plan: 'pro' });
    await settle();
    const [e] = r.events();
    expect(r.requests[0]!.url).toBe('https://beats.test/e');
    expect(r.requests[0]!.body.key).toBe('bk_test');
    expect(e).toMatchObject({
      event: 'signup',
      url: 'http://localhost:3000/start',
      title: 'Start',
      language: navigator.language,
      properties: { plan: 'pro' },
    });
    expect(e!.event_id).toMatch(UUID);
    expect(new Date(e!.timestamp!).getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(typeof e!.screen_width).toBe('number');
    expect(e).not.toHaveProperty('distinct_id');
    expect(e).not.toHaveProperty('session_id');
    expect(e).not.toHaveProperty('groups');
  });

  it('adds super properties and lets event properties win', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.register({ app: 'shop', plan: 'free' });
    client.track('a', { plan: 'pro' });
    client.unregister('app');
    client.track('b');
    await settle();
    expect(r.events().map((e) => e.properties)).toEqual([{ app: 'shop', plan: 'pro' }, { plan: 'free' }]);
  });

  it('queues calls made before init and runs them after it', async () => {
    const r = recordRequests();
    const { client } = makeClient({}, false);
    client.register({ early: true });
    client.track('before-init');
    await settle();
    expect(r.fetch).not.toHaveBeenCalled();
    client.init({ key: 'bk_test', apiHost: 'https://beats.test', autoPageviews: false, batching: false });
    client.init({ key: 'other', apiHost: 'https://other.test' }); // ignored
    await settle();
    expect(r.events()).toMatchObject([{ event: 'before-init', properties: { early: true } }]);
    expect(r.requests.every((x) => x.body.key === 'bk_test')).toBe(true);
  });

  it('warns and does nothing without key or apiHost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createBeats();
    client.init({ key: '', apiHost: '' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('logs events in debug mode', async () => {
    recordRequests();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { client } = makeClient({ debug: true });
    client.track('x');
    expect(log).toHaveBeenCalledWith('[beats]', 'x', expect.objectContaining({ event: 'x' }));
  });
});

describe('cookieless mode (default)', () => {
  it('stores nothing and sets no cookies', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.pageview();
    client.track('x');
    client.identify('user-1');
    client.group('company', 'acme');
    await settle();
    expect(storageKeys()).toEqual([]);
    expect(document.cookie).toBe('');
    expect(r.events().slice(0, 2).every((e) => e.distinct_id === undefined)).toBe(true);
  });

  it('uses the user id from identify for the rest of the page, in memory', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.identify('user-1', { email: 'a@example.com' });
    client.track('x');
    await settle();
    expect(r.events()).toMatchObject([
      { event: '$identify', distinct_id: 'user-1', properties: { $set: { email: 'a@example.com' } } },
      { event: 'x', distinct_id: 'user-1' },
    ]);
    expect(r.events()[0]!.properties).not.toHaveProperty('$anon_distinct_id');
    expect(client.getDistinctId()).toBe('user-1');
  });
});

describe('consent and identified mode', () => {
  it('consent(true) stores an anonymous id and a session id', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.track('before');
    client.consent(true);
    client.track('after');
    await settle();
    const [before, after] = r.events();
    expect(before!.distinct_id).toBeUndefined();
    const aid = localStorage.getItem(KEYS.anonymousId);
    expect(aid).toMatch(UUID);
    expect(after!.distinct_id).toBe(aid);
    expect(after!.session_id).toMatch(UUID);
    expect(sessionStorage.getItem(KEYS.session)).toMatch(new RegExp(`^${after!.session_id}\\.\\d+$`));
    expect(document.cookie).toBe('');
  });

  it('keeps ids across page loads after consent', async () => {
    const r = recordRequests();
    makeClient().client.consent(true);
    const aid = localStorage.getItem(KEYS.anonymousId);
    const { client } = makeClient();
    client.track('second page');
    await settle();
    expect(r.events()[0]!.distinct_id).toBe(aid);
  });

  it('cookieless: false starts in identified mode', async () => {
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
    client.track('x');
    await settle();
    expect(r.events()[0]!.distinct_id).toBe(localStorage.getItem(KEYS.anonymousId));
  });

  it('keeps the session while active and starts a new one after 30 minutes without events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
    client.track('a');
    vi.setSystemTime(Date.now() + 29 * 60_000);
    client.track('b');
    vi.setSystemTime(Date.now() + 31 * 60_000);
    client.track('c');
    await settle();
    const [a, b, c] = r.events();
    expect(a!.session_id).toBe(b!.session_id);
    expect(c!.session_id).not.toBe(b!.session_id);
    expect(c!.distinct_id).toBe(a!.distinct_id);
  });

  it('continues the session of the tab on the next page load', async () => {
    const r = recordRequests();
    makeClient({ cookieless: false }).client.track('a');
    makeClient({ cookieless: false }).client.track('b');
    await settle();
    const [a, b] = r.events();
    expect(b!.session_id).toBe(a!.session_id);
  });

  it('honours a custom session timeout', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false, sessionTimeout: 5 });
    client.track('a');
    vi.setSystemTime(Date.now() + 6 * 60_000);
    client.track('b');
    await settle();
    const [a, b] = r.events();
    expect(b!.session_id).not.toBe(a!.session_id);
  });

  it('identify links the anonymous id and stores the user id', async () => {
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
    const aid = localStorage.getItem(KEYS.anonymousId);
    client.identify('user-1', { plan: 'pro' });
    client.identify('user-1'); // same user: nothing new
    client.identify('user-1', { plan: 'team' }); // same user with properties: $set
    await settle();
    expect(r.events()).toMatchObject([
      { event: '$identify', distinct_id: 'user-1', properties: { $anon_distinct_id: aid, $set: { plan: 'pro' } } },
      { event: '$set', distinct_id: 'user-1', properties: { $set: { plan: 'team' } } },
    ]);
    expect(localStorage.getItem(KEYS.userId)).toBe('user-1');
  });

  it('consent(false) deletes stored ids and returns to cookieless mode', async () => {
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
    client.identify('user-1');
    client.consent(false);
    expect(storageKeys()).toEqual([]);
    client.track('after');
    await settle();
    const after = r.events().at(-1)!;
    expect(after.distinct_id).toBeUndefined();
    expect(after.session_id).toBeUndefined();
    expect(storageKeys()).toEqual([]);
  });

  it('identify before consent is kept when consent is given', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.identify('user-1');
    client.consent(true);
    client.track('x');
    await settle();
    expect(localStorage.getItem(KEYS.userId)).toBe('user-1');
    expect(r.events().at(-1)!.distinct_id).toBe('user-1');
  });

  it('reset forgets the user and starts a new anonymous id', async () => {
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
    const aid = localStorage.getItem(KEYS.anonymousId);
    client.identify('user-1');
    client.register({ plan: 'pro' });
    client.group('company', 'acme');
    client.track('before');
    client.reset();
    client.track('after');
    await settle();
    const before = r.events().at(-2)!;
    const after = r.events().at(-1)!;
    expect(before).toMatchObject({ distinct_id: 'user-1', groups: { company: 'acme' }, properties: { plan: 'pro' } });
    expect(after.distinct_id).toBe(localStorage.getItem(KEYS.anonymousId));
    expect(after.distinct_id).not.toBe(aid);
    expect(after.session_id).not.toBe(before.session_id);
    expect(after.properties).toEqual({});
    expect(after.groups).toBeUndefined();
    expect(localStorage.getItem(KEYS.userId)).toBeNull();
  });

  it('works when storage is blocked', async () => {
    const r = recordRequests();
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    const { client } = makeClient({ cookieless: false });
    client.track('a');
    client.track('b');
    await settle();
    vi.restoreAllMocks();
    const [a, b] = r.events();
    expect(a!.distinct_id).toMatch(UUID);
    expect(b!.distinct_id).toBe(a!.distinct_id);
    expect(b!.session_id).toBe(a!.session_id);
  });
});

describe('product analytics', () => {
  it('sends $set, $group and $feature_used', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.setPersonProperties({ plan: 'pro' }, { first_seen: '2026-01-01' });
    client.group('company', 'acme-gmbh', { name: 'ACME GmbH' });
    client.featureUsed('export', 'csv');
    client.featureUsed('search');
    await settle();
    expect(r.events()).toMatchObject([
      { event: '$set', properties: { $set: { plan: 'pro' }, $set_once: { first_seen: '2026-01-01' } } },
      {
        event: '$group',
        groups: { company: 'acme-gmbh' },
        properties: { $group_type: 'company', $group_key: 'acme-gmbh', $group_set: { name: 'ACME GmbH' } },
      },
      { event: '$feature_used', groups: { company: 'acme-gmbh' }, properties: { $feature: 'export', $variant: 'csv' } },
      { event: '$feature_used', properties: { $feature: 'search' } },
    ]);
    expect(r.events()[3]!.properties).not.toHaveProperty('$variant');
  });

  it('opt-out stops sending, is remembered, and opt-in reverts it', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.optOut();
    client.track('dropped');
    expect(localStorage.getItem(KEYS.optOut)).toBe('1');
    const second = makeClient().client;
    second.track('dropped too');
    second.optIn();
    second.track('kept');
    await settle();
    expect(r.names()).toEqual(['kept']);
    expect(localStorage.getItem(KEYS.optOut)).toBeNull();
  });

  it('respects Do Not Track and Global Privacy Control when asked to', async () => {
    const r = recordRequests();
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    makeClient({ respectDoNotTrack: true }).client.track('dnt');
    makeClient().client.track('ignored dnt');
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    makeClient({ respectDoNotTrack: true }).client.track('gpc');
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
    await settle();
    expect(r.names()).toEqual(['ignored dnt']);
  });
});

describe('e-commerce helpers', () => {
  for (const c of golden) {
    it(`${c.helper} sends the golden payload`, async () => {
      const r = recordRequests();
      const { client } = makeClient({ currency: c.defaults?.currency });
      (client[c.helper as 'search'] as (i: unknown) => void)(c.input);
      await settle();
      expect(r.events()).toHaveLength(1);
      expect({ event: r.events()[0]!.event, properties: r.events()[0]!.properties }).toEqual(c.expected);
    });
  }

  it('logs validation warnings in debug mode only', async () => {
    recordRequests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    makeClient().client.orderCompleted({ revenue: 10 } as never);
    expect(warn).not.toHaveBeenCalled();
    makeClient({ debug: true }).client.orderCompleted({ revenue: 10 } as never);
    expect(warn).toHaveBeenCalledWith('[beats]', '$order_completed: order_id is required');
  });
});

describe('pageviews and page leave', () => {
  it('sends $pageview with the document referrer, then the previous URL on SPA navigation', async () => {
    const r = recordRequests();
    Object.defineProperty(document, 'referrer', { value: 'https://search.example/', configurable: true });
    const { client } = makeClient({ autoPageviews: true });
    await settle();
    history.pushState(null, '', '/products?page=2');
    history.pushState(null, '', '/products?page=2#reviews'); // hash only: not a page view
    history.replaceState(null, '', '/products?page=2'); // same page
    window.dispatchEvent(new PopStateEvent('popstate')); // same page
    history.replaceState(null, '', '/start'); // back navigation is covered by the browser tests
    await settle(20);
    const views = r.events().filter((e) => e.event === '$pageview');
    expect(views.map((e) => [e.url, e.referrer])).toEqual([
      ['http://localhost:3000/start', 'https://search.example/'],
      ['http://localhost:3000/products?page=2', 'http://localhost:3000/start'],
      ['http://localhost:3000/start', 'http://localhost:3000/products?page=2'],
    ]);
    expect(client.getDistinctId()).toBeUndefined();
  });

  it('counts hash changes with hashRouting', async () => {
    const r = recordRequests();
    makeClient({ autoPageviews: true, hashRouting: true });
    await settle();
    history.pushState(null, '', '/start#/cart');
    await settle();
    expect(r.events().filter((e) => e.event === '$pageview').map((e) => e.url)).toEqual([
      'http://localhost:3000/start',
      'http://localhost:3000/start#/cart',
    ]);
  });

  it('applies consent given right after init to the first page view', async () => {
    const r = recordRequests();
    const { client } = makeClient({ autoPageviews: true });
    client.consent(true);
    await settle();
    expect(r.events()[0]).toMatchObject({ event: '$pageview', distinct_id: localStorage.getItem(KEYS.anonymousId) });
  });

  it('sends $pageleave with visible time and scroll depth when hidden, by beacon', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = recordRequests();
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    const { client } = makeClient({ batching: { size: 50, interval: 60_000 } });
    client.pageview();
    vi.setSystemTime(Date.now() + 4000);
    window.scrollY = 1000;
    window.dispatchEvent(new Event('scroll'));
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + 60_000); // hidden time does not count
    setVisibility('visible');
    vi.setSystemTime(Date.now() + 1000);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide')); // only once
    const beacons = r.requests.filter((x) => x.beacon);
    expect(beacons.map((b) => b.body.batch.map((e) => e.event))).toEqual([['$pageview', '$pageleave'], ['$pageleave']]);
    const [first, second] = r.events().filter((e) => e.event === '$pageleave');
    expect(first!.properties).toEqual({ $duration_ms: 4000, $scroll_depth: 75 });
    expect(second!.properties).toEqual({ $duration_ms: 1000, $scroll_depth: 75 });
    window.scrollY = 0;
  });

  it('sends $pageleave for the previous page on SPA navigation', async () => {
    const r = recordRequests();
    makeClient({ autoPageviews: true });
    await settle();
    history.pushState(null, '', '/next');
    await settle();
    expect(r.events().map((e) => [e.event, e.url])).toEqual([
      ['$pageview', 'http://localhost:3000/start'],
      ['$pageleave', 'http://localhost:3000/start'],
      ['$pageview', 'http://localhost:3000/next'],
    ]);
  });

  it('trackPageleave: false sends no $pageleave but still flushes on hide', async () => {
    const r = recordRequests();
    const { client } = makeClient({ trackPageleave: false, batching: { size: 50, interval: 60_000 } });
    client.pageview();
    setVisibility('hidden');
    expect(r.requests.filter((x) => x.beacon).flatMap((x) => x.body.batch.map((e) => e.event))).toEqual(['$pageview']);
  });
});

describe('clicks', () => {
  function click(el: Element, init: MouseEventInit = {}) {
    el.addEventListener('click', (e) => e.preventDefault());
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  }

  it('tracks outbound links and downloads when enabled', async () => {
    const r = recordRequests();
    makeClient({ trackOutboundLinks: true, trackDownloads: true });
    document.body.innerHTML = `
      <a id="out" href="https://other.example/page"><span id="inner">other</span></a>
      <a id="local" href="/about">about</a>
      <a id="pdf" href="/files/Price-List.PDF?v=2">pdf</a>
      <a id="mail" href="mailto:a@example.com">mail</a>`;
    click(document.getElementById('inner')!);
    click(document.getElementById('local')!);
    click(document.getElementById('pdf')!);
    click(document.getElementById('mail')!);
    document.getElementById('out')!.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    document.getElementById('out')!.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }));
    expect(r.events().map((e) => [e.event, e.properties])).toEqual([
      ['$outbound_click', { $href: 'https://other.example/page' }],
      ['$file_download', { $href: 'http://localhost:3000/files/Price-List.PDF?v=2', $extension: 'pdf' }],
      ['$outbound_click', { $href: 'https://other.example/page' }],
    ]);
    expect(r.requests.every((x) => x.beacon)).toBe(true);
  });

  it('accepts a custom list of download extensions', () => {
    const r = recordRequests();
    makeClient({ trackDownloads: ['stl'] });
    document.body.innerHTML = `<a id="a" href="/m.stl">a</a><a id="b" href="/x.pdf">b</a>`;
    click(document.getElementById('a')!);
    click(document.getElementById('b')!);
    expect(r.names()).toEqual(['$file_download']);
  });

  it('tracks data-beats-event elements when trackAttributes is on', () => {
    const r = recordRequests();
    makeClient({ trackAttributes: true });
    document.body.innerHTML = `
      <button id="b" data-beats-event="plan_selected" data-beats-prop-plan="pro" data-beats-prop-billing-period="yearly"><i id="icon"></i></button>`;
    click(document.getElementById('icon')!);
    expect(r.events().map((e) => [e.event, e.properties])).toEqual([
      ['plan_selected', { plan: 'pro', billing_period: 'yearly' }],
    ]);
  });

  it('ignores clicks when nothing is enabled', () => {
    const r = recordRequests();
    makeClient();
    document.body.innerHTML = `<a id="out" href="https://other.example/" data-beats-event="x">x</a>`;
    click(document.getElementById('out')!);
    expect(r.requests).toEqual([]);
  });
});
