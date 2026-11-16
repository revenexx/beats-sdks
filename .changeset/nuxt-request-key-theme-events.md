---
"@revenexx/beats-nuxt": minor
---

Nuxt: take the ingest key per request from the `x-revenexx-beats-key` header of the server-side rendered request (falls back to `beats.key`; `requestKeyHeader` names another header or turns it off), and map the revenexx theme event stream (`theme-events/1`) onto the e-commerce helpers (`themeEvents`, on by default).
