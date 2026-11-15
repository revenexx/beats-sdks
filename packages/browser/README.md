# @revenexx/beats-browser

Browser client of beats: web, product and e-commerce analytics. Cookieless by default, 2 KB script-tag build.

```sh
npm install @revenexx/beats-browser
```

```js
import { beats } from '@revenexx/beats-browser';

beats.init({ key: 'bk_...', apiHost: 'https://beats.example.com' });
beats.track('signup', { plan: 'pro' });
```

Script-tag builds: `@revenexx/beats-browser/beats.js` (minimal) and `/beats.full.js` (everything); a beats server also serves them as `/beats.js` and `/beats.full.js`.

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#npm). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
