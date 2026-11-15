# beats JavaScript SDKs

[![CI](https://github.com/revenexx/beats-sdks/actions/workflows/ci.yml/badge.svg)](https://github.com/revenexx/beats-sdks/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@revenexx/beats-browser?label=%40revenexx%2Fbeats-browser)](https://www.npmjs.com/package/@revenexx/beats-browser)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The JavaScript clients of **beats**, the web, product and e-commerce
analytics of the revenexx Revenue Cloud. They send events to a beats server
(for example `https://beats.revenexx.com`) with the ingest key of a project.

- Cookieless by default: no cookies and no browser storage until the visitor
  consents.
- Page views (also in single-page apps), page leave with visible time and
  scroll depth, custom events, people and groups.
- E-commerce helpers from product list to order and refund, with amounts
  normalized to cents and invalid events caught before they are sent.
- Batching, `sendBeacon` on page hide, retries with backoff, an offline
  buffer and idempotent event ids.
- A 2 KB script-tag build, and integrations for Vue, Nuxt and React.

| Package | For |
| --- | --- |
| [`@revenexx/beats-browser`](packages/browser) | Websites and web apps |
| [`@revenexx/beats-node`](packages/node) | Backends on Node.js 18+, Bun and Deno: server-side events, orders and refunds |
| [`@revenexx/beats-vue`](packages/vue) | Vue 3 plugin, `useBeats()` composable, Vue Router page views |
| [`@revenexx/beats-nuxt`](packages/nuxt) | Nuxt 3 and 4 module |
| [`@revenexx/beats-react`](packages/react) | React provider and `useBeats()` hook |
| [`@revenexx/beats-core`](packages/core) | Shared types, item model, validation and wire format (used by the others) |

## Install

```sh
npm install @revenexx/beats-browser      # or: pnpm add / yarn add
```

You need the address of your beats server and the **ingest key** of the
project (it starts with `bk_`; it is public and safe to ship to browsers).

## Usage

### Script tag

A beats server serves the browser client itself: `/beats.js` (page views,
page leave, `track`, consent; about 2 KB gzip) and `/beats.full.js`
(everything; about 5 KB gzip).

```html
<script>
  window.beats = window.beats || function () { (beats.q = beats.q || []).push(arguments); };
</script>
<script defer src="https://beats.example.com/beats.js" data-key="bk_..."></script>
```

The same files are in the npm package (`@revenexx/beats-browser/beats.js`,
`/beats.full.js`) if you prefer to host them yourself.

### Browser

```js
import { beats } from '@revenexx/beats-browser';

beats.init({ key: 'bk_...', apiHost: 'https://beats.example.com' });
beats.track('signup', { plan: 'pro' });

beats.consent(true); // after the visitor agreed: identified mode
beats.identify('user-42', { plan: 'pro' });
beats.productViewed({ item: { product_id: 'p-100', name: 'Cordless Drill', price: 129.9 } });
```

### Node.js

```js
import { Beats } from '@revenexx/beats-node';

const beats = new Beats({ key: process.env.BEATS_INGEST_KEY, host: 'https://beats.example.com', currency: 'EUR' });
beats.orderCompleted('user-42', {
  order_id: 'A-1001', revenue: '59.90',
  items: [{ sku: 'P1', price: '29.95', quantity: 2 }],
});
await beats.shutdown(); // before the process exits
```

### Vue, Nuxt, React

```js
// Vue
import { createBeatsPlugin } from '@revenexx/beats-vue';
app.use(createBeatsPlugin({ key: 'bk_...', apiHost: 'https://beats.example.com', router }));

// Nuxt: nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@revenexx/beats-nuxt'],
  beats: { key: 'bk_...', apiHost: 'https://beats.example.com' },
});
```

```jsx
// React (also the Next.js app router)
import { BeatsProvider, useBeats } from '@revenexx/beats-react';

<BeatsProvider options={{ key: 'bk_...', apiHost: 'https://beats.example.com' }}>
  <App />
</BeatsProvider>;
```

The full guide (all options, consent, e-commerce, the Node.js client,
privacy notes) is in [docs/usage.md](docs/usage.md).

## Development

Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the browser tests
pnpm run check                          # build, lint, types, all tests, size budgets
```

| Command | Does |
| --- | --- |
| `pnpm run build` | all packages (tsup: ESM, CJS, types; IIFE for the script tags) |
| `pnpm run lint` | Biome, then publint and Are the Types Wrong on the built packages |
| `pnpm run typecheck` | `tsc` per package |
| `pnpm test` | unit tests (vitest, happy-dom) |
| `pnpm run test:browser` | build, then browser tests with Playwright and Chromium |
| `pnpm run size` | fails when a script-tag build is over its budget |

The browser tests start a local site and a local collector that records
requests; the Node.js tests start a local HTTP server. Nothing talks to a
real beats server.

### Size budgets

| Build | Contains | Budget (gzip) | Now |
| --- | --- | --- | --- |
| `beats.js` | page views, SPA navigation, page leave, `track`, `register`, `consent`, batching, retries | 2,048 B | 2,041 B |
| `beats.full.js` | the full client | 6,144 B | 5,059 B |

The script-tag builds are minified with terser; properties starting with
`_` are internal and shortened. `beats.js` has almost no room left: new
features belong in a plugin (`packages/browser/src/plugins`) that only the
full build includes. For the same reason the sources use loose equality and
assignments in expressions, and the lint rules against them are off.

### Layout of the browser client

- `src/transport.ts`: the only code that talks to the server (queue,
  batches, `sendBeacon`, retries, offline buffer).
- `src/client.ts`: envelope, identity and consent, sessions, page views,
  page leave, and the plugin hooks.
- `src/plugins/`: `people` (identify, `$set`, groups, features, reset),
  `privacy` (opt-out, Do Not Track), `commerce`, `clicks` (outbound links,
  downloads, `data-beats-event`), `vitals`.
- `src/loader.ts`: the script-tag loader (data attributes, stub queue).

The wire format (endpoints, bodies, limits) is in
`packages/core/src/protocol.ts`, the event and item types in
`packages/core/src/types.ts`.

## Releases

All packages share one version and are released with
[Changesets](https://github.com/changesets/changesets): add a changeset with
`pnpm changeset` to a pull request; merging the "Version Packages" pull
request that the release workflow opens publishes the packages to npm with
provenance, through npm trusted publishing. See
[docs/releasing.md](docs/releasing.md) and the [changelog](CHANGELOG.md).

## Contributing and security

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
Please report vulnerabilities privately, as described in
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
