# @revenexx/beats-node

Server-side client of beats for Node.js 18+, Bun and Deno: events, orders and refunds from your backend.

```sh
npm install @revenexx/beats-node
```

```js
import { Beats } from '@revenexx/beats-node';

const beats = new Beats({ key: process.env.BEATS_INGEST_KEY, host: 'https://beats.example.com' });
beats.capture({ distinctId: 'user-42', event: 'subscription_renewed', properties: { plan: 'pro' } });
await beats.shutdown();
```

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#nodejs). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
