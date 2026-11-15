// Appended to dist/module.d.ts by the build (tsup.config.ts): types for the
// `beats:consent` hook and `useNuxtApp().$beats` in a Nuxt app.
declare module '#app' {
  interface RuntimeNuxtHooks {
    /** Call with `true` when the visitor consents to analytics storage, `false` when consent is withdrawn. */
    'beats:consent': (granted: boolean) => void;
  }
  interface NuxtApp {
    $beats: import('@revenexx/beats-browser').BeatsClient;
  }
}
