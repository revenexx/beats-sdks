# @revenexx/beats-browser

Browser client of beats: web, product and e-commerce analytics. Cookieless by default, 2.2 KB script-tag build.

```sh
npm install @revenexx/beats-browser
```

```js
import { beats } from '@revenexx/beats-browser';

beats.init({ key: 'bk_...', apiHost: 'https://beats.example.com' });
beats.track('signup', { plan: 'pro' });
```

By default URLs and referrers are sent without query string and fragment (UTM parameters and `gclid` are kept; `allowedQueryParams` changes the list, `captureQueryString: true` sends everything) and without the page title (`captureTitle: true`). `sanitizeUrl(url)` rewrites paths, for example tokens; `beforeSend(event)` changes any event or drops it by returning `null`:

```js
beats.init({
  key: 'bk_...',
  apiHost: 'https://beats.example.com',
  sanitizeUrl: (url) => url.replace(/\/invitations\/[^/?#]+/, '/invitations/:token'),
  beforeSend: (event) => (event.event === 'debug_ping' ? null : event),
});
```

Script-tag builds: `@revenexx/beats-browser/beats.js` (minimal) and `/beats.full.js` (everything); a beats server also serves them as `/beats.js` and `/beats.full.js`.

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#npm). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
