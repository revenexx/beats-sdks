# beats JavaScript clients

The browser, Node.js, Vue, Nuxt and React clients of beats. How to use
them is described in [docs/clients.md](../docs/clients.md); the event
format in [docs/events.md](../docs/events.md); the endpoints in
[docs/ingestion.md](../docs/ingestion.md).

| Package | Directory |
| --- | --- |
| `@beats-analytics/core` | `packages/core`: event and item types, normalization, validation, wire format (`src/protocol.ts`) |
| `@beats-analytics/browser` | `packages/browser`: browser client, script-tag builds `dist/beats.js` and `dist/beats.full.js` |
| `@beats-analytics/node` | `packages/node` |
| `@beats-analytics/vue` | `packages/vue` |
| `@beats-analytics/nuxt` | `packages/nuxt` |
| `@beats-analytics/react` | `packages/react` |

The scope `@beats-analytics` is provisional. Nothing is published yet; the release workflow publishes the packages when the repository has an `NPM_TOKEN` secret.

## Quick start

```html
<script defer src="https://beats.example.com/beats.js" data-key="bk_..."></script>
```

```js
import { beats } from '@beats-analytics/browser';
beats.init({ key: 'bk_...', apiHost: 'https://beats.example.com' });
beats.track('signup', { plan: 'pro' });
```

```js
import { Beats } from '@beats-analytics/node';
const beats = new Beats({ key: process.env.BEATS_INGEST_KEY, host: 'https://beats.example.com' });
beats.orderCompleted('user-42', { order_id: 'A-1001', revenue: '59.90', currency: 'EUR', items: [{ sku: 'P1', price: '29.95', quantity: 2 }] });
await beats.shutdown();
```

## Development

Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm run build          # all packages (tsup: ESM, CJS, types; IIFE for the script tags)
pnpm test               # unit tests (vitest, happy-dom)
pnpm run test:browser   # build, then browser tests with Playwright and Chromium
pnpm run size           # fails when a script-tag build is over its budget
pnpm run check          # build, type check, all tests, size check
pnpm run copy-asset     # build the browser client and copy beats.js and beats.full.js
                        # to crates/beats-ingest/assets/, which the server embeds
```

The browser tests need Playwright's Chromium (`PLAYWRIGHT_BROWSERS_PATH`
or Playwright's default location); they start a local site and a local
collector that records requests. The Node.js tests start a local HTTP
server. `crates/beats-ingest/tests/snippet/snippet.test.js` tests the
copied assets from the server side and runs with `cargo test`.

## Size budgets

| Build | Contains | Budget (gzip) | Now |
| --- | --- | --- | --- |
| `beats.js` | page views, SPA navigation, page leave, `track`, `register`, `consent`, batching, retries | 2,048 B | 2,041 B |
| `beats.full.js` | the full client | 6,144 B | 5,059 B |

The script-tag builds are minified with terser; properties starting with
`_` are internal and shortened. `beats.js` has almost no room left: new
features belong in a plugin (`packages/browser/src/plugins`) that only the
full build includes.

## Layout of the browser client

- `src/transport.ts`: the only code that talks to the server (queue,
  batches, `sendBeacon`, retries, offline buffer).
- `src/client.ts`: envelope, identity and consent, sessions, page views,
  page leave, and the plugin hooks.
- `src/plugins/`: `people` (identify, `$set`, groups, features, reset),
  `privacy` (opt-out, Do Not Track), `commerce`, `clicks` (outbound links,
  downloads, `data-beats-event`), `vitals`.
- `src/loader.ts`: the script-tag loader (data attributes, stub queue).
