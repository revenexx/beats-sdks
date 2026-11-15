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

Documentation: [usage guide](https://github.com/revenexx/beats-sdks/blob/main/docs/usage.md#nuxt). Source, issues and changelog: <https://github.com/revenexx/beats-sdks>.

License: MIT.
