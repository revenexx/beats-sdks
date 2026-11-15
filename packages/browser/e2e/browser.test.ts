import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@beats-analytics/core';
import { startServers } from './server.js';

let servers: Awaited<ReturnType<typeof startServers>>;
let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  servers = await startServers();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await servers?.close();
});

beforeEach(async () => {
  servers.clear();
  await context?.close();
  context = await browser.newContext();
  page = await context.newPage();
});

/** A page that loads a script-tag build with the given data attributes. */
function html(opts: { build?: 'beats.js' | 'beats.full.js'; attrs?: string; head?: string; body?: string; title?: string } = {}) {
  const { build = 'beats.js', attrs = '', head = '', body = '', title = 'Test page' } = opts;
  return `<!doctype html><html><head><title>${title}</title>${head}
<script defer src="${servers.collectorUrl}/${build}" data-key="bk_e2e" ${attrs}></script></head>
<body style="margin:0">${body}<div style="height:3000px"></div></body></html>`;
}

async function waitFor(predicate: (events: Envelope[]) => boolean, timeout = 5000): Promise<Envelope[]> {
  const start = Date.now();
  for (;;) {
    const events = servers.events();
    if (predicate(events)) return events;
    if (Date.now() - start > timeout) throw new Error(`timed out; events: ${JSON.stringify(events.map((e) => e.event))}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const count = (name: string, n = 1) => (events: Envelope[]) => events.filter((e) => e.event === name).length >= n;

/** Makes the page hidden the way the browser reports it, and fires visibilitychange on the document. */
async function hide(p: Page) {
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
}

async function storage(p: Page) {
  return p.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
}

describe('minimal build (beats.js)', () => {
  it('sends a $pageview on load, cookieless, to POST /e as text/plain', async () => {
    servers.page('/landing', html({ title: 'Landing' }));
    await page.goto(`${servers.siteUrl}/landing?utm_source=newsletter`, { referer: 'https://search.example/' });
    const [pv] = await waitFor(count('$pageview'));
    expect(pv).toMatchObject({
      event: '$pageview',
      url: `${servers.siteUrl}/landing?utm_source=newsletter`,
      referrer: 'https://search.example/',
      title: 'Landing',
      properties: {},
    });
    expect(pv!.distinct_id).toBeUndefined();
    expect(pv!.session_id).toBeUndefined();
    expect(pv!.screen_width).toBeGreaterThan(0);
    expect(pv!.language).toBeTruthy();
    expect(servers.recorded[0]!.key).toBe('bk_e2e');
    expect(servers.recorded[0]!.contentType).toMatch(/^text\/plain/);
    expect(await storage(page)).toEqual({ local: {}, session: {}, cookie: '' });
    expect(await context.cookies()).toEqual([]);
  });

  it('tracks SPA navigation with pushState and the back button', async () => {
    servers.page('*', html());
    await page.goto(`${servers.siteUrl}/app`);
    await waitFor(count('$pageview'));
    await page.evaluate(() => history.pushState({}, '', '/app/settings'));
    await page.evaluate(() => history.replaceState({}, '', '/app/settings')); // same page
    await page.evaluate(() => history.pushState({}, '', '/app/settings#billing')); // hash only
    await waitFor(count('$pageview', 2));
    await page.goBack(); // to /app/settings (hash change only)
    await page.goBack(); // to /app
    const events = await waitFor(count('$pageview', 3));
    const views = events.filter((e) => e.event === '$pageview').map((e) => [new URL(e.url!).pathname, e.referrer && new URL(e.referrer).pathname]);
    expect(views).toEqual([
      ['/app', undefined],
      ['/app/settings', '/app'],
      ['/app', '/app/settings'],
    ]);
    // the previous page got its $pageleave before each SPA page view
    expect(events.filter((e) => e.event === '$pageleave').map((e) => new URL(e.url!).pathname)).toEqual(['/app', '/app/settings']);
  });

  it('sends $pageleave with duration and scroll depth by beacon when the page is hidden', async () => {
    servers.page('/article', html({ attrs: 'data-batching="false"' }));
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`${servers.siteUrl}/article`);
    await waitFor(count('$pageview'));
    await page.mouse.wheel(0, 1200);
    await page.waitForFunction(() => scrollY >= 1200);
    await page.waitForTimeout(300);
    await hide(page);
    const events = await waitFor(count('$pageleave'));
    const leave = events.find((e) => e.event === '$pageleave')!;
    expect(leave.url).toBe(`${servers.siteUrl}/article`);
    expect(leave.properties!.$duration_ms).toBeGreaterThanOrEqual(300);
    expect(leave.properties!.$scroll_depth).toBe(Math.round(((1200 + 600) / 3000) * 100));
  });

  it('sends queued events and $pageleave when the user navigates away (pagehide)', async () => {
    servers.page('/a', html());
    await page.goto(`${servers.siteUrl}/a`);
    await page.waitForFunction(() => typeof (window as { beats?: { track?: unknown } }).beats?.track === 'function');
    await page.evaluate(() => (window as unknown as { beats: (...a: unknown[]) => void }).beats('track', 'clicked_cta'));
    await page.goto(`${servers.collectorUrl}/elsewhere`);
    const events = await waitFor(count('$pageleave'));
    expect(events.map((e) => e.event)).toEqual(['$pageview', 'clicked_cta', '$pageleave']);
  });

  it('keeps calls made before the script loaded (stub queue)', async () => {
    servers.page(
      '/stub',
      html({
        head: `<script>window.beats = window.beats || function(){(beats.q=beats.q||[]).push(arguments)};
          beats('register', {site: 'docs'}); beats('track', 'early', {n: 1});</script>`,
      }),
    );
    await page.goto(`${servers.siteUrl}/stub`);
    const events = await waitFor(count('$pageview'));
    expect(events.map((e) => [e.event, e.properties])).toEqual([
      ['early', { site: 'docs', n: 1 }],
      ['$pageview', { site: 'docs' }],
    ]);
  });

  it('switches storage with consent', async () => {
    servers.page('*', html({ attrs: 'data-batching="false"' }));
    await page.goto(`${servers.siteUrl}/consent`);
    await waitFor(count('$pageview'));
    expect(await storage(page)).toEqual({ local: {}, session: {}, cookie: '' });

    await page.evaluate(() => (window as unknown as { beats: (...a: unknown[]) => void }).beats('consent', true));
    await page.evaluate(() => (window as unknown as { beats: (...a: unknown[]) => void }).beats('track', 'after_consent'));
    let events = await waitFor(count('after_consent'));
    const s = await storage(page);
    expect(Object.keys(s.local)).toEqual(['beats_aid']);
    expect(Object.keys(s.session)).toEqual(['beats_sid']);
    const after = events.find((e) => e.event === 'after_consent')!;
    expect(after.distinct_id).toBe(s.local.beats_aid);
    expect(after.session_id).toBe(s.session.beats_sid!.split('.')[0]);

    // the next page load keeps the ids
    await page.goto(`${servers.siteUrl}/consent/2`);
    events = await waitFor(count('$pageview', 2));
    const second = events.filter((e) => e.event === '$pageview')[1]!;
    expect(second.distinct_id).toBe(s.local.beats_aid);
    expect(second.session_id).toBe(after.session_id);

    await page.evaluate(() => (window as unknown as { beats: (...a: unknown[]) => void }).beats('consent', false));
    await page.evaluate(() => (window as unknown as { beats: (...a: unknown[]) => void }).beats('track', 'after_withdrawal'));
    events = await waitFor(count('after_withdrawal'));
    expect(await storage(page)).toEqual({ local: {}, session: {}, cookie: '' });
    expect(events.find((e) => e.event === 'after_withdrawal')!.distinct_id).toBeUndefined();
    expect(await context.cookies()).toEqual([]);
  });
});

describe('full build (beats.full.js)', () => {
  type W = Window & { beats: Record<string, (...a: unknown[]) => void> };

  it('tracks outbound links, downloads and data-beats-event clicks', async () => {
    servers.page(
      '/links',
      html({
        build: 'beats.full.js',
        attrs: 'data-track-outbound-links data-track-downloads data-track-attributes',
        body: `<a id="pdf" href="/files/catalog.pdf" download>catalog</a>
          <button id="plan" data-beats-event="plan_selected" data-beats-prop-plan="pro">Pro</button>
          <a id="out" href="${servers.collectorUrl}/partner">partner</a>`,
      }),
    );
    servers.page('/files/catalog.pdf', 'pdf');
    await page.goto(`${servers.siteUrl}/links`);
    await waitFor(count('$pageview'));
    await page.click('#plan');
    await page.click('#pdf');
    await page.click('#out');
    await page.waitForURL(`${servers.collectorUrl}/partner`);
    const events = await waitFor(count('$outbound_click'));
    expect(events.filter((e) => e.event !== '$pageview' && e.event !== '$pageleave').map((e) => [e.event, e.properties])).toEqual([
      ['plan_selected', { plan: 'pro' }],
      ['$file_download', { $href: `${servers.siteUrl}/files/catalog.pdf`, $extension: 'pdf' }],
      ['$outbound_click', { $href: `${servers.collectorUrl}/partner` }],
    ]);
  });

  it('records an e-commerce flow from product view to order', async () => {
    servers.page('*', html({ build: 'beats.full.js', attrs: 'data-currency="EUR" data-cookieless="false"' }));
    await page.goto(`${servers.siteUrl}/p/drill`);
    await page.waitForFunction(() => typeof (window as unknown as W).beats?.productViewed === 'function');
    await page.evaluate(() => {
      const b = (window as unknown as W).beats;
      const drill = { product_id: 'p-100', name: 'Cordless Drill', category: 'Tools/Drills/Cordless', price: 129.9 };
      b.productViewed!({ item: drill });
      b.productAdded!({ cart_id: 'c-1', items: [{ ...drill, quantity: 2 }] });
      b.cartViewed!({ cart_id: 'c-1', items: [{ ...drill, quantity: 2 }] });
      b.checkoutStarted!({ cart_id: 'c-1', items: [{ ...drill, quantity: 2 }] });
      b.checkoutStep!({ step: 1, step_name: 'shipping', option: 'express' });
      b.identify!('user-42', { email: 'buyer@example.com' });
      b.orderCompleted!({ order_id: 'o-1', revenue: 264.7, tax: 42.26, shipping: 4.9, items: [{ ...drill, quantity: 2 }] });
    });
    const events = await waitFor(count('$order_completed'));
    const flow = events.filter((e) => e.event !== '$pageview');
    expect(flow.map((e) => e.event)).toEqual([
      '$product_viewed',
      '$product_added',
      '$cart_viewed',
      '$checkout_started',
      '$checkout_step',
      '$identify',
      '$order_completed',
    ]);
    const item = { product_id: 'p-100', name: 'Cordless Drill', category: 'Tools/Drills/Cordless', price: '129.90' };
    expect(flow[0]!.properties).toEqual({ currency: 'EUR', items: [{ ...item, quantity: 1 }] });
    expect(flow[2]!.properties).toEqual({ cart_id: 'c-1', currency: 'EUR', value: '259.80', items: [{ ...item, quantity: 2 }] });
    expect(flow[6]!.properties).toEqual({
      order_id: 'o-1',
      revenue: '264.70',
      tax: '42.26',
      shipping: '4.90',
      currency: 'EUR',
      items: [{ ...item, quantity: 2 }],
    });
    const anon = flow[0]!.distinct_id;
    expect(anon).toMatch(/^[0-9a-f-]{36}$/);
    expect(flow[5]!.properties).toMatchObject({ $anon_distinct_id: anon, $set: { email: 'buyer@example.com' } });
    expect(flow[6]!.distinct_id).toBe('user-42');
    expect(new Set(flow.map((e) => e.session_id)).size).toBe(1);
  });

  it('sends $web_vitals once when the page is hidden', async () => {
    servers.page('/vitals', html({ build: 'beats.full.js', attrs: 'data-track-web-vitals', body: '<h1>Large heading for LCP</h1>' }));
    await page.goto(`${servers.siteUrl}/vitals`);
    await waitFor(count('$pageview'));
    await page.click('h1');
    await page.waitForTimeout(200);
    await hide(page);
    await hide(page);
    const events = await waitFor(count('$web_vitals'));
    await page.waitForTimeout(200);
    const vitals = servers.events().filter((e) => e.event === '$web_vitals');
    expect(vitals).toHaveLength(1);
    const p = vitals[0]!.properties!;
    expect(p.$ttfb_ms).toEqual(expect.any(Number));
    expect(p.$fcp_ms).toEqual(expect.any(Number));
    expect(p.$lcp_ms).toEqual(expect.any(Number));
    expect(events.length).toBeGreaterThan(0);
  });

  it('opt-out stops sending and is honoured on the next page', async () => {
    servers.page('*', html({ build: 'beats.full.js', attrs: 'data-batching="false"' }));
    await page.goto(`${servers.siteUrl}/one`);
    await waitFor(count('$pageview'));
    await page.evaluate(() => (window as unknown as W).beats.optOut!());
    await page.evaluate(() => (window as unknown as W).beats.track!('hidden'));
    await page.goto(`${servers.siteUrl}/two`);
    await page.waitForTimeout(500);
    expect(servers.events().map((e) => e.event)).toEqual(['$pageview']);
  });
});
