# @revenexx/beats-nuxt

## 0.2.0

### Minor Changes

- ef6d868: Nuxt: take the ingest key per request from the `x-revenexx-beats-key` header of the server-side rendered request (falls back to `beats.key`; `requestKeyHeader` names another header or turns it off), and map the revenexx theme event stream (`theme-events/1`) onto the e-commerce helpers (`themeEvents`, on by default).
- 99cf6f6: Privacy-safe URLs, `beforeSend`, `sanitizeUrl` and route properties.

  **Behaviour change:** URLs and referrers are now sent without query string and fragment, except the parameters in `allowedQueryParams` (default `DEFAULT_QUERY_PARAMS`: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`; with `hashRouting` the route in the fragment is kept). `captureQueryString: true` restores the previous behaviour. `document.title` is still sent; the new `captureTitle: false` leaves it out. A change of the query string still counts as a page view.

  - `beforeSend(event)` runs on every event (page views, page leave, custom, people and commerce events) before it is queued; it returns the event, changed or not, or `null` to drop it.
  - `sanitizeUrl(url)` rewrites the URL and the referrer of every event, for example to replace tokens in paths.
  - If either throws, the event is dropped.
  - Vue and Nuxt: with a router, page views carry the matched route pattern (`route`, for example `/customers/:id`) and the route name (`route_name`), and both are registered so every later event of the page carries them, its `$pageleave` included. `routeProperties: false` turns this off.
  - Nuxt: the new options go through runtime config; the functions go into `beats.config.ts` (source directory or project root, `config` names another file) with the auto-imported `defineBeatsConfig`.
  - Docs: `identify` with the plain user id works in cookieless mode (no consent, nothing stored); no traits such as e-mail or name. `register` for tenant, role, plan, locale and app version.

### Patch Changes

- 0b791da: Page views carry the new page's title, page leaves the old one. Nuxt sends the page view after `page:finish` and the head update that follows it (at most one second after the navigation when no `page:finish` comes), so titles set with `useHead`/`useSeoMeta` are no longer those of the previous page. Vue keeps `router.afterEach` plus the next tick and takes a `ready` option to wait longer. `$pageleave` on SPA navigation now carries the title of the page being left (its page view's title), not the next page's; when the page is hidden it carries the current title.
- Updated dependencies [0b791da]
- Updated dependencies [99cf6f6]
  - @revenexx/beats-browser@0.2.0
  - @revenexx/beats-vue@0.2.0

## 0.1.0

### Minor Changes

- 055cdcf: First release: Nuxt 3 and 4 module with runtime config, route page views and a `beats:consent` hook.

### Patch Changes

- Updated dependencies [055cdcf]
- Updated dependencies [055cdcf]
  - @revenexx/beats-browser@0.1.0
  - @revenexx/beats-vue@0.1.0
