# @revenexx/beats-react

React provider and `useBeats()` hook for the beats browser client; works in the Next.js app router.

```sh
npm install @revenexx/beats-react
```

```jsx
import { BeatsProvider, useBeats } from '@revenexx/beats-react';

<BeatsProvider options={{ key: 'bk_...', apiHost: 'https://beats.example.com' }}>
  <App />
</BeatsProvider>;
```

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#react). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
