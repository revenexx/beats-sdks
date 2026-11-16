# @revenexx/beats-nuxt

Nuxt 3 and 4 module for the beats browser client.

```sh
npm install @revenexx/beats-nuxt
```

```js
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@revenexx/beats-nuxt'],
  beats: { key: 'bk_...', apiHost: 'https://beats.example.com' },
});
```

Options can be set at runtime with `NUXT_PUBLIC_BEATS_KEY`, `NUXT_PUBLIC_BEATS_API_HOST` and so on; `useBeats()` is auto-imported.

## Privacy defaults, `beforeSend` and `sanitizeUrl`

URLs and referrers are sent without query string and fragment, except the UTM parameters and `gclid`; titles are not sent. Page views and every later event of a page carry the matched route pattern (`route: '/customers/:id'`) and the route name (`route_name`); `routeProperties: false` turns that off.

```js
beats: {
  apiHost: 'https://beats.example.com',
  // replaces the default list: keep the defaults and add the app's harmless parameters
  allowedQueryParams: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'tab', 'view', 'page', 'sort'],
  // captureTitle: true, captureQueryString: true restore the old behaviour
},
```

Functions cannot live in runtime config. Put them in `beats.config.ts` in the source directory (`app/` in Nuxt 4) or the project root (`beats.config` names another file); `defineBeatsConfig` is auto-imported:

```ts
// app/beats.config.ts
export default defineBeatsConfig({
  sanitizeUrl: (url) => url.replace(/\/invitations\/[^/?#]+/, '/invitations/:token'),
  beforeSend: (event) => (event.event === 'debug_ping' ? null : event), // null drops the event
});
```

For logged-in apps: `useBeats().identify(user.id)` with the internal id only (no e-mail, no name) works without consent and stores nothing; `useBeats().register({ tenant, role, plan, locale, app_version })` adds context to every event.

## Ingest key per request

One deployment can serve several beats projects. When the server-side rendered request carries the header `x-revenexx-beats-key`, its value is the ingest key of that page and wins over `beats.key`; without the header, `beats.key` is used. The revenexx platform sets this header on shared theme Sites to the tenant's key, so a theme needs no key in its config:

```js
beats: { apiHost: 'https://beats.revenexx.com' },
```

Use the header only behind a proxy that sets it and drops copies sent by clients (the revenexx platform does both). Otherwise a client could send its own key, and a cache in front of the app could serve that page to others. `requestKeyHeader: 'x-other-header'` reads another header; `requestKeyHeader: false` turns it off. A page that has neither a header nor `beats.key` sends nothing; with the header on, the console warning for that case appears only with `debug: true`.

## Theme events

The module turns the revenexx theme event stream ([`theme-events/1`](https://schemas.revenexx.com/theme-events.schema.json), the `revenexx:event` Nuxt hook and DOM event) into beats e-commerce events, so a theme that emits them needs no beats calls:

| Theme event | beats |
| --- | --- |
| `view_item_list` | `productListViewed` |
| `select_item` | `productClicked` |
| `view_item` | `productViewed` |
| `search` | `search` |
| `add_to_cart` / `remove_from_cart` | `productAdded` / `productRemoved` |
| `view_cart` | `cartViewed` |
| `begin_checkout` | `checkoutStarted` |
| `add_shipping_info` / `add_payment_info` | `checkoutStep` 1 `shipping` / 2 `payment` |
| `purchase` | `orderCompleted` |
| `request_quote` | `quoteRequested` |
| `add_to_orderlist` | `wishlistAdded` with `list: 'orderlist'` |
| `punchout_transfer` | custom event `punchout_transfer` |

`page_view` is left out (page views come from the router), as are `form_submit`, `login` and `sign_up`. The article number (`sku`) becomes the `product_id`, net prices are used (`themeEvents: { priceBasis: 'gross' }` for gross), and an event the theme sends on both transports is counted once. Nothing identifies the visitor: the client stays cookieless unless the app calls `identify` or `beats:consent`. `themeEvents: false` turns the mapping off.

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#nuxt). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
