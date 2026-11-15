# Usage guide

The beats clients send to a beats server's endpoints: `POST /e` from
browsers, `POST /api/v1/events` from backends. The wire format is in
`packages/core/src/protocol.ts`, the event and item types in
`packages/core/src/types.ts`.

| Package | For |
| --- | --- |
| `@revenexx/beats-browser` | Websites and web apps: web, product and e-commerce analytics |
| `@revenexx/beats-node` | Backends on Node.js 18+, Bun and Deno: server-side events, orders and refunds |
| `@revenexx/beats-vue` | Vue 3 plugin, `useBeats()` composable, Vue Router page views |
| `@revenexx/beats-nuxt` | Nuxt 3 and 4 module |
| `@revenexx/beats-react` | React provider and `useBeats()` hook |
| `@revenexx/beats-core` | Shared types, item model, validation and normalization (used by the others) |

## Script tag

beats serves two builds of the browser client:

| File | Contains | Size (gzip) |
| --- | --- | --- |
| `/beats.js` | page views (also in single-page apps), page leave, `track`, `register`, `consent`, batching, retries | about 2.0 KB |
| `/beats.full.js` | everything in `@revenexx/beats-browser` | about 5.0 KB |

```html
<script>
  window.beats = window.beats || function () { (beats.q = beats.q || []).push(arguments); };
</script>
<script defer src="https://beats.example.com/beats.js" data-key="bk_..."></script>
```

The first script is optional: it keeps calls made before `beats.js` has
loaded. Calls take the method name first: `beats('track', 'signup',
{ plan: 'pro' })`. After loading, `beats.track('signup', ...)` works too.

Options are `data-*` attributes named like the `init` options below
(`trackOutboundLinks` is `data-track-outbound-links`). An attribute without
a value or with `"true"` turns an option on, `"false"` turns it off, any
other value is passed as a string. `data-api` sets `apiHost`; by default
it is the origin the script was loaded from.

```html
<script defer src="https://beats.example.com/beats.full.js" data-key="bk_..."
  data-track-outbound-links data-track-downloads data-track-web-vitals
  data-currency="EUR"></script>
```

Options that take an object or a list (`batching`, a custom list for
`trackDownloads`) cannot be set with attributes; use the npm package for
those.

## npm

```sh
npm install @revenexx/beats-browser
```

```js
import { beats } from '@revenexx/beats-browser';

beats.init({ key: 'bk_...', apiHost: 'https://beats.example.com' });
beats.track('signup', { plan: 'pro' });
```

`beats` is a shared instance; `createBeats()` creates another one. Calls
made before `init` are kept (up to 100) and run after it. Without `window`
(server-side rendering) `init` and all calls do nothing.
`@revenexx/beats-browser/lite` exports the parts (`createClient` and the
plugins `people`, `privacy`, `commerce`, `clicks`, `vitals`) for a smaller
custom client.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `key` | — | Ingest key of the project (required). |
| `apiHost` | — | Origin of the beats server (required). |
| `cookieless` | `true` | No cookies and no browser storage. `false`: identified mode from the start (set `cookieless = false` on the project too). |
| `autoPageviews` | `true` | `$pageview` on load and after `history.pushState`, `replaceState` and `popstate` when path or query changed. |
| `hashRouting` | `false` | Count changes of the hash as navigation (hash routers). |
| `trackPageleave` | `true` | `$pageleave` with visible time and scroll depth. |
| `trackOutboundLinks` | `false` | `$outbound_click` for clicks on links to other hosts. |
| `trackDownloads` | `false` | `$file_download` for links to files (`pdf`, `zip`, `docx`, `xlsx`, `csv`, `dmg`, `exe`, `mp4`, ...); a list of extensions replaces the default list. |
| `trackWebVitals` | `false` | `$web_vitals` once per page load. |
| `trackAttributes` | `false` | Clicks on elements with `data-beats-event` (see below). |
| `respectDoNotTrack` | `false` | Send nothing when the browser sends Do Not Track or Global Privacy Control. Not in `/beats.js`. |
| `batching` | `{ size: 10, interval: 1000 }` | Send when `size` events are queued or after `interval` ms. `false` sends each event at once. At most 1,000 events per request. |
| `maxRetries` | `10` | Retries of a failed request. |
| `sessionTimeout` | `30` | Minutes without events after which a new session starts (identified mode). |
| `currency` | — | Currency of commerce events that name none. |
| `debug` | `false` | Log events and validation warnings to the console. |

### Sending

Events are queued and sent in batches to `POST {apiHost}/e` as
`{"key", "consent", "events"}` with `Content-Type: text/plain` (no CORS
preflight). When the page is hidden or left, and after tracked link
clicks, the queue is sent with `navigator.sendBeacon` (with `fetch` and
`keepalive` if the beacon is refused).

A request that fails with a network error, 408, 429 or 5xx is retried
after 1, 2, 4, ... seconds (at most 30, with jitter), up to `maxRetries`
times; then its events are dropped. Other answers (400, 401, 403, 413)
drop the request's events without retry. While the browser is offline,
events wait for the `online` event without using up retries. At most
1,000 events are kept in memory; the oldest are dropped first. Nothing is
stored on the device, so events still queued when the tab is closed and
the beacon fails are lost.

Each event gets an `event_id` (UUID) on the client; the server skips ids
it has already written, so a retry does not count twice.

Automated browsers (`navigator.webdriver` is set) send nothing.

## Web analytics

Page views, SPA navigation and page leave work without code. After a
navigation inside the page, the referrer of the `$pageview` is the
previous URL.

`$pageleave` is sent each time the page is hidden (tab switch, minimized
window, navigation away) and before the next SPA page view. It carries
`$duration_ms`, the visible time since the page view or since the page
last became visible, and `$scroll_depth`, the furthest point scrolled to
in percent of the page height. A page view can therefore have several
`$pageleave` events; the time on the page is the sum of their
`$duration_ms`.

For a 404 page:

```js
beats.track('$not_found');
```

`$web_vitals` (with `trackWebVitals`) is sent once, when the page is first
hidden, with what the browser reported until then: `$lcp_ms`, `$fcp_ms`,
`$ttfb_ms`, `$cls` (largest session window), `$inp_ms`. `$inp_ms` is the
longest interaction seen, not the 98th percentile of all interactions, and
is missing when there was no interaction. Browsers without the entry types
(Safari has no LCP and INP data) send fewer fields.

## Product analytics

```js
beats.identify('user-42', { email: 'ada@example.com', plan: 'pro' }); // $identify
beats.setPersonProperties({ plan: 'team' }, { first_seen: '2026-11-15' }); // $set, $set_once
beats.group('company', 'acme-gmbh', { name: 'ACME GmbH' }); // $group; later events carry groups
beats.featureUsed('export', 'csv'); // $feature_used
beats.register({ app_version: '4.2.0' }); // added to every later event of the page
beats.unregister('app_version');
beats.track('$logged_out');
beats.reset(); // logout: forgets user id, super properties and groups
```

`register` and `group` are kept in memory for the current page only. The
user id from `identify` is kept in memory in cookieless mode and in
`localStorage` in identified mode. In cookieless mode `setPersonProperties`
sends nothing before `identify`, because the server needs a distinct id
for `$set`.

`optOut()` stops sending and stores `beats_optout` in `localStorage`, which
every build honours on later pages; `optIn()` removes it.

### Declarative tracking

With `trackAttributes`, a click on an element with `data-beats-event`
(or inside one) sends that event; `data-beats-prop-*` attributes become
properties, with `-` turned into `_`:

```html
<button data-beats-event="plan_selected" data-beats-prop-plan="pro"
        data-beats-prop-billing-period="yearly">Choose Pro</button>
```

sends `plan_selected` with `{"plan": "pro", "billing_period": "yearly"}`.
Values are strings.

## E-commerce

The helpers build the standard e-commerce events from items with the
fields of `Item` in `packages/core/src/types.ts`:

```js
const drill = { product_id: 'p-100', sku: 'p-100-blue', name: 'Cordless Drill',
  category: 'Tools/Drills/Cordless', brand: 'Acme', price: 129.9 };

beats.productListViewed({ list_id: 'drills', list_name: 'Drills', items: [{ ...drill, position: 1 }] });
beats.productClicked({ list_id: 'drills', item: { ...drill, position: 1 } });
beats.productViewed({ item: drill });
beats.search({ query: 'cordless drill', results: 12 });
beats.productAdded({ cart_id: 'c-1', items: [{ ...drill, quantity: 2 }] });
beats.productRemoved({ cart_id: 'c-1', items: [{ sku: 'p-100-blue' }] });
beats.cartViewed({ cart_id: 'c-1', items: [{ ...drill, quantity: 2 }] });
beats.checkoutStarted({ cart_id: 'c-1', coupon: 'SPRING', items: [{ ...drill, quantity: 2 }] });
beats.checkoutStep({ step: 2, step_name: 'shipping', option: 'express' });
beats.orderCompleted({ order_id: 'A-1001', revenue: 264.7, tax: 42.26, shipping: 4.9,
  currency: 'EUR', items: [{ ...drill, quantity: 2 }] });
beats.orderRefunded({ order_id: 'A-1001', revenue: 129.9, items: [{ ...drill, quantity: 1 }] });
beats.promotionViewed({ promotion_id: 'spring-sale', promotion_name: 'Spring sale', creative: 'banner-a', slot: 'home-top' });
beats.promotionClicked({ promotion_id: 'spring-sale', slot: 'home-top' });
beats.wishlistAdded({ items: [drill] });
beats.quoteRequested({ quote_id: 'Q-77', items: [{ ...drill, quantity: 40 }] }); // B2B
```

Normalization before sending:

- Amounts (`price`, `discount`, `value`, `revenue`, `tax`, `shipping`)
  become strings with two decimals (`129.9` → `"129.90"`). Numbers are
  rounded half away from zero to cents; strings with more than two
  decimals are rounded with a warning; anything else is dropped with a
  warning.
- `quantity` defaults to 1; a negative or non-integer quantity is
  replaced with a warning. `product_id`, `sku` and the other text fields
  become strings.
- `currency` is upper-cased. The event's currency is the one given, else
  the `currency` option, else the first item's. Items keep their own
  currency only if they name one.
- `value` of `cartViewed`, `checkoutStarted` and `quoteRequested` is
  computed from the items (`price * quantity - discount`) when not given.
- `revenue` of `orderRefunded` is the refunded amount; a negative number
  is made positive with a warning.

Warnings are logged with `debug: true`. Events the server would reject
are not sent, and the reason is always logged: a missing `order_id` on
orders and refunds, an item without `product_id` and `sku`, more than 200
items, a negative order revenue. (The server rejects a whole request when
one event is invalid, so sending them would also lose the events queued
with them.)

Orders are best recorded server-side (below). If the confirmation page
sends `$order_completed` too, the server stores only one event per
`order_id` within seven days.

## Consent

By default the client is cookieless: it sets no cookies and uses no
browser storage, and the server derives a visitor id that changes every
day.

```js
beats.consent(true);  // the visitor agreed: identified mode
beats.consent(false); // withdrawn: stored ids are deleted, cookieless again
```

In identified mode the client stores:

| Storage | Key | Value |
| --- | --- | --- |
| `localStorage` | `beats_id` | random anonymous id (UUID) |
| `localStorage` | `beats_uid` | user id from `identify` |
| `sessionStorage` | `beats_sid` | session id and time of the last event; a new session starts after 30 minutes without events |

Requests carry `"consent": true`, and only then does the server use the
browser's `distinct_id` and `session_id`. A stored `beats_id` on a later
page load counts as the earlier consent, so call `consent(false)` when the
visitor withdraws it. `consent(false)` also forgets the user id in memory.

Consent given right after `init` (or queued before the script loaded)
applies to the first page view, which is sent after the current task.

With a consent manager, call `consent` from its callbacks, for example:

```js
window.addEventListener('consent-changed', (e) => {
  beats('consent', e.detail.analytics === true);
});
```

## Vue

```js
import { createApp } from 'vue';
import { createBeatsPlugin } from '@revenexx/beats-vue';

app.use(router);
app.use(createBeatsPlugin({ key: 'bk_...', apiHost: 'https://beats.example.com', router }));
```

```js
import { useBeats } from '@revenexx/beats-vue';
const beats = useBeats();
beats.productViewed({ item });
```

With `router`, page views are sent after each completed navigation (not
for failed or aborted ones, nor for hash changes) on the next tick, when
the new page has set its title; the history API is then not watched.
Without `router`, the client's history API tracking is used. The client
is also available as `$beats` in templates. During server-side rendering
nothing is initialized.

## Nuxt

```js
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@revenexx/beats-nuxt'],
  beats: { key: 'bk_...', apiHost: 'https://beats.example.com', trackOutboundLinks: true },
});
```

The options go to `runtimeConfig.public.beats` and can be set at runtime
with `NUXT_PUBLIC_BEATS_KEY`, `NUXT_PUBLIC_BEATS_API_HOST` and so on. The
client runs in a client-only plugin; page views are sent on route changes.
`useBeats()` is auto-imported; on the server it returns a client whose
calls do nothing.

A consent manager can switch modes with the `beats:consent` hook:

```js
const nuxtApp = useNuxtApp();
await nuxtApp.callHook('beats:consent', true);
```

`exposeGlobal: true` also sets `window.beats` for scripts outside Vue.

The module has been tested with mocked Nuxt APIs, not yet in a running
Nuxt application.

## React

```jsx
import { BeatsProvider, useBeats } from '@revenexx/beats-react';

<BeatsProvider options={{ key: 'bk_...', apiHost: 'https://beats.example.com' }}>
  <App />
</BeatsProvider>;

function BuyButton({ item }) {
  const beats = useBeats();
  return <button onClick={() => beats.productAdded({ items: [item] })}>Add to cart</button>;
}
```

The provider initializes the client in an effect, so nothing runs during
server-side rendering, and once only (also in strict mode). It makes no
assumption about the router: page views come from the history API. To
send them from a router hook instead, pass `autoPageviews: false` and call
`beats.pageview()` after each navigation.

Next.js app router: the package is marked `'use client'`, so
`BeatsProvider` can be used in the root `app/layout.tsx`. Next.js changes
pages with `history.pushState`, which the client tracks; the page view can
be sent before the new page has set `document.title`, so titles of SPA
page views may be those of the previous page.

## Node.js

```sh
npm install @revenexx/beats-node
```

```js
import { Beats } from '@revenexx/beats-node';

const beats = new Beats({ key: process.env.BEATS_INGEST_KEY, host: 'https://beats.example.com', currency: 'EUR' });

beats.orderCompleted('user-42', {
  order_id: 'A-1001', revenue: '264.70', tax: '42.26', shipping: '4.90',
  items: [{ product_id: 'p-100', price: '129.90', quantity: 2 }],
}, { timestamp: order.paidAt, ip: req.ip, userAgent: req.get('user-agent') });

beats.orderRefunded('user-42', { order_id: 'A-1001', revenue: '129.90', items: [{ product_id: 'p-100', price: '129.90' }] });

beats.capture({ distinctId: 'user-42', event: 'subscription_renewed', properties: { plan: 'pro' } });
beats.identify({ distinctId: 'user-42', anonymousId: idFromBrowser, properties: { plan: 'pro' } });
beats.group({ distinctId: 'user-42', type: 'company', key: 'acme-gmbh', properties: { name: 'ACME GmbH' } });

await beats.shutdown(); // before the process exits
```

- Every call needs a `distinctId` (a `TypeError` otherwise).
- Every e-commerce helper is `helper(distinctId, input, options?)` with
  the inputs of the browser helpers; inputs the server would reject throw
  a `TypeError`, other problems go to `onWarning`.
- `options` (and the `capture` input) take `timestamp` (`Date`, ISO
  string or milliseconds; default: the time of the call), `eventId`,
  `sessionId`, `groups`, `url`, `referrer`, and `ip` and `userAgent` of
  the end user, for geolocation and device fields.
- Each call returns the `event_id`. Pass the same `eventId` when you
  resend an event (for example from a job that may run twice); the server
  skips ids it has seen.

Events are sent to `POST {host}/api/v1/events` with `Authorization:
Bearer <key>` as `{"events": [...]}`, when `flushAt` events (default 50,
at most 1,000) are queued or after `flushInterval` ms (default 5,000).
Batches over 500 KB are split. Network errors, timeouts (`timeout`,
default 10 s), 408, 429 and 5xx are retried `maxRetries` times (default 3)
after `retryDelay` ms (default 500), doubling, at most 30 s, honouring
`Retry-After`. When a request is rejected with 400, the events the server
names are reported to `onError` and the others are sent again. Events
that cannot be delivered are passed to `onError` (default: logged with
`console.error`). At most `maxQueueSize` events (default 10,000) are
queued.

`flush()` sends the queue now. `shutdown()` sends it and stops the client;
call it on `SIGTERM`. On Node.js, the queue is also sent when the event
loop is about to exit (`beforeExit`, turn off with `flushOnExit: false`);
that does not happen on `process.exit()` or a signal. Bun and Deno work
through their `fetch`; there, call `shutdown()` yourself.

## Privacy notes

- In cookieless mode the browser client stores nothing on the device and
  sets no cookies. The opt-out flag is the only exception, and only after
  `optOut()`.
- Requests use `fetch` with the default credentials mode: cross-origin
  requests to beats carry no cookies. If beats is served from the site's
  own origin, the browser sends that origin's cookies with the request;
  beats does not read them.
- The client does not read form fields, text or other page content.
  Events contain the URL (including the query string), the referrer, the
  title, the viewport width and the browser language, plus what you send.
  Remove personal data from URLs (tokens, e-mail addresses in query
  strings) before they reach the page, or with `autoPageviews: false` and
  your own `pageview` calls.
- Properties are sent as given; do not put personal data into event or
  person properties without a legal basis.
- The IP address is used by the server for geolocation and the cookieless
  visitor id and is not stored.
