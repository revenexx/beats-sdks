---
"@revenexx/beats-vue": patch
"@revenexx/beats-nuxt": patch
---

`trackRouter` counts the initial page load once: a `router.replace` that keeps the path (a changed query or hash on the same page, such as the replace a prerendered Nuxt page makes while it hydrates) no longer sends another `$pageview`. Pushes that change the query and every change of the path still count.
