---
"@revenexx/beats-browser": patch
"@revenexx/beats-vue": patch
"@revenexx/beats-nuxt": patch
---

Page views carry the new page's title, page leaves the old one. Nuxt sends the page view after `page:finish` and the head update that follows it (at most one second after the navigation when no `page:finish` comes), so titles set with `useHead`/`useSeoMeta` are no longer those of the previous page. Vue keeps `router.afterEach` plus the next tick and takes a `ready` option to wait longer. `$pageleave` on SPA navigation now carries the title of the page being left (its page view's title), not the next page's; when the page is hidden it carries the current title.
