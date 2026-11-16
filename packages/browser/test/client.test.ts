// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import golden from '../../core/test/golden/commerce.json' with { type: 'json' };
import { KEYS } from '../src/client.js';
import { createBeats } from '../src/index.js';
import { makeClient, recordRequests, setVisibility, setWebdriver, settle, silence } from './helpers.js';

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
  vi.restoreAllMocks();
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
      language: navigator.language,
      properties: { plan: 'pro' },
    });
    // no title by default (captureTitle)
    expect(e).not.toHaveProperty('title');
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

  it('sends nothing from automated browsers (navigator.webdriver)', async () => {
    const r = recordRequests();
    setWebdriver(true);
    try {
      makeClient().client.track('bot');
      await settle();
    } finally {
      setWebdriver(false);
    }
    expect(r.requests).toEqual([]);
  });

  it('sends the consent state with each request', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.track('a');
    await settle();
    client.consent(true);
    client.track('b');
    await settle();
    expect(r.requests.map((x) => x.body.consent)).toEqual([false, true]);
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

describe('URLs, titles and beforeSend', () => {
  const ref = (value: string) => Object.defineProperty(document, 'referrer', { value, configurable: true });
  afterEach(() => ref(''));

  it('strips query string and fragment from URL and referrer, keeping UTM parameters and gclid', async () => {
    const r = recordRequests();
    history.replaceState(null, '', '/invitations/abc?token=s3cret&utm_source=mail&utm_campaign=nov&gclid=g1#top');
    ref('https://search.example/results?q=jane+doe#x');
    const { client } = makeClient();
    client.pageview();
    client.track('x');
    await settle();
    const [view, x] = r.events();
    expect(view!.url).toBe('http://localhost:3000/invitations/abc?utm_source=mail&utm_campaign=nov&gclid=g1');
    expect(view!.referrer).toBe('https://search.example/results');
    expect(x!.url).toBe(view!.url);
  });

  it('allowedQueryParams replaces the list, captureQueryString: true sends everything', async () => {
    const r = recordRequests();
    history.replaceState(null, '', '/customers?tab=orders&sort=date&q=jane&utm_source=mail#row-4');
    makeClient({ allowedQueryParams: ['tab', 'sort'] }).client.track('a');
    makeClient({ allowedQueryParams: [] }).client.track('b');
    makeClient({ captureQueryString: true }).client.track('c');
    await settle();
    expect(r.events().map((e) => e.url)).toEqual([
      'http://localhost:3000/customers?tab=orders&sort=date',
      'http://localhost:3000/customers',
      'http://localhost:3000/customers?tab=orders&sort=date&q=jane&utm_source=mail#row-4',
    ]);
  });

  it('takes a comma-separated list from a script tag attribute', async () => {
    const r = recordRequests();
    history.replaceState(null, '', '/p?tab=a&view=grid&q=x');
    makeClient({ allowedQueryParams: 'tab,view' as never }).client.track('a');
    await settle();
    expect(r.events()[0]!.url).toBe('http://localhost:3000/p?tab=a&view=grid');
  });

  it('keeps the route of a hash router, without its query', async () => {
    const r = recordRequests();
    history.replaceState(null, '', '/app?x=1#/orders/7?token=t');
    makeClient({ hashRouting: true }).client.track('a');
    await settle();
    expect(r.events()[0]!.url).toBe('http://localhost:3000/app#/orders/7');
  });

  it('sends the title only with captureTitle', async () => {
    const r = recordRequests();
    document.title = 'Jane Doe – Customer';
    makeClient().client.track('a');
    makeClient({ captureTitle: true }).client.track('b');
    await settle();
    expect(r.events()[0]).not.toHaveProperty('title');
    expect(r.events()[1]!.title).toBe('Jane Doe – Customer');
  });

  it('applies sanitizeUrl to the URL and the referrer of every event, page leave included', async () => {
    const r = recordRequests();
    ref('http://localhost:3000/invitations/tok-1?x=1');
    history.replaceState(null, '', '/invitations/tok-2');
    const sanitizeUrl = vi.fn((u: string) => u.replace(/\/invitations\/[^/?#]+/, '/invitations/:token'));
    makeClient({ autoPageviews: true, sanitizeUrl });
    await settle();
    history.pushState(null, '', '/start');
    await settle();
    expect(r.events().map((e) => [e.event, e.url, e.referrer])).toEqual([
      ['$pageview', 'http://localhost:3000/invitations/:token', 'http://localhost:3000/invitations/:token'],
      ['$pageleave', 'http://localhost:3000/invitations/:token', undefined],
      ['$pageview', 'http://localhost:3000/start', 'http://localhost:3000/invitations/:token'],
    ]);
    // it gets the URL after the query string was removed
    expect(sanitizeUrl).toHaveBeenCalledWith('http://localhost:3000/invitations/tok-1');
  });

  it('beforeSend can change every event, commerce and automatic ones included, or drop it with null', async () => {
    const r = recordRequests();
    const seen: string[] = [];
    const { client } = makeClient({
      autoPageviews: true,
      beforeSend: (e) => {
        seen.push(e.event);
        if (e.event === 'internal_ping') return null;
        return { ...e, properties: { ...e.properties, checked: true } };
      },
    });
    await settle();
    client.track('internal_ping');
    client.productViewed({ item: { product_id: 'p-1', price: 1 } });
    client.identify('42');
    setVisibility('hidden');
    await settle();
    expect(seen).toEqual(['$pageview', 'internal_ping', '$product_viewed', '$identify', '$pageleave']);
    expect(r.names()).toEqual(['$pageview', '$product_viewed', '$identify', '$pageleave']);
    expect(r.events().every((e) => e.properties!.checked === true)).toBe(true);
  });

  it('drops the event when beforeSend or sanitizeUrl throws', async () => {
    const r = recordRequests();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeClient({
      beforeSend: () => {
        throw new Error('boom');
      },
    }).client.track('a');
    makeClient({
      sanitizeUrl: () => {
        throw new Error('boom');
      },
    }).client.track('b');
    makeClient().client.track('c');
    await settle();
    expect(r.names()).toEqual(['c']);
    expect(error).toHaveBeenCalledTimes(2);
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
    client.identify('user-1', { plan: 'pro' });
    client.track('x');
    await settle();
    expect(r.events()).toMatchObject([
      { event: '$identify', distinct_id: 'user-1', properties: { $set: { plan: 'pro' } } },
      { event: 'x', distinct_id: 'user-1' },
    ]);
    expect(r.events()[0]!.properties).not.toHaveProperty('$anon_distinct_id');
    expect(client.getDistinctId()).toBe('user-1');
  });

  it('identify with the plain user id works without consent: nothing stored, consent false', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.identify('42');
    client.register({ tenant: 'acme', role: 'admin', plan: 'pro', locale: 'de-DE', app_version: '4.2.0' });
    client.track('report_exported');
    await settle();
    expect(storageKeys()).toEqual([]);
    expect(r.requests.map((x) => x.body.consent)).toEqual([false, false]);
    expect(r.events()).toMatchObject([
      { event: '$identify', distinct_id: '42', properties: {} },
      {
        event: 'report_exported',
        distinct_id: '42',
        properties: { tenant: 'acme', role: 'admin', plan: 'pro', locale: 'de-DE', app_version: '4.2.0' },
      },
    ]);
    expect(r.events()[0]!.properties).not.toHaveProperty('$set');
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
  it('does not send $set without a distinct id (cookieless mode before identify)', async () => {
    const r = recordRequests();
    const { client } = makeClient();
    client.setPersonProperties({ plan: 'pro' });
    client.identify('u-1');
    client.setPersonProperties({ plan: 'team' });
    await settle();
    expect(r.events().map((e) => [e.event, e.distinct_id])).toEqual([
      ['$identify', 'u-1'],
      ['$set', 'u-1'],
    ]);
  });

  it('sends $set, $group and $feature_used', async () => {
    const r = recordRequests();
    const { client } = makeClient({ cookieless: false });
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
    makeClient().client.cartViewed({ items: [{ sku: 'a', price: 'x' }] });
    expect(warn).not.toHaveBeenCalled();
    makeClient({ debug: true }).client.cartViewed({ items: [{ sku: 'a', price: 'x' }] });
    expect(warn).toHaveBeenCalledWith('[beats]', '$cart_viewed: items[0].price is not a decimal amount: "x"');
  });

  it('does not send an event the server would reject, and says why', async () => {
    const r = recordRequests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = makeClient();
    client.orderCompleted({ revenue: 10, currency: 'EUR' } as never);
    client.productAdded({ items: [{ name: 'no id' }] });
    client.track('still sent');
    await settle();
    expect(r.names()).toEqual(['still sent']);
    expect(warn.mock.calls).toEqual([
      ['[beats] not sent:', '$order_completed: order_id is required'],
      ['[beats] not sent:', '$product_added: items[0] has neither product_id nor sku'],
    ]);
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
    // the query string is not sent by default, but a change of it is still a page view
    expect(views.map((e) => [e.url, e.referrer])).toEqual([
      ['http://localhost:3000/start', 'https://search.example/'],
      ['http://localhost:3000/products', 'http://localhost:3000/start'],
      ['http://localhost:3000/start', 'http://localhost:3000/products'],
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
    expect(beacons.map((b) => b.body.events.map((e) => e.event))).toEqual([['$pageview', '$pageleave'], ['$pageleave']]);
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
    expect(r.requests.filter((x) => x.beacon).flatMap((x) => x.body.events.map((e) => e.event))).toEqual(['$pageview']);
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
