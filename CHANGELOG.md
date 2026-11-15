# Changelog

All notable changes to the beats JavaScript SDKs are recorded here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the packages use [semantic versioning](https://semver.org/). All packages
share one version. Before 1.0, minor versions may change the API; the
changelog says when and how to migrate.

## [Unreleased]

## [0.1.0] - 2026-11-15

The first version, published as `@revenexx/beats-*`. The clients were
developed in the beats repository under the provisional, never published
scope `@beats-analytics`; this repository continues their history.

### Added

- `@revenexx/beats-browser`: cookieless by default, identified mode after
  consent; page views with history API navigation, page leave with visible
  time and scroll depth; batching with `sendBeacon`, retries and an offline
  buffer; people and groups; e-commerce helpers; outbound links, downloads,
  web vitals and declarative click tracking. Script-tag builds `beats.js`
  (2 KB gzip) and `beats.full.js` (5 KB gzip).
- `@revenexx/beats-node`: batching to `POST /api/v1/events`, retries with
  backoff and `Retry-After`, flush on shutdown, idempotent event ids,
  e-commerce helpers; Node.js 18+, Bun and Deno.
- `@revenexx/beats-vue`: plugin, `useBeats()`, Vue Router page views.
- `@revenexx/beats-nuxt`: Nuxt 3 and 4 module with runtime config, route
  page views and a `beats:consent` hook.
- `@revenexx/beats-react`: `BeatsProvider` and `useBeats()`, usable in the
  Next.js app router.
- `@revenexx/beats-core`: event and item types, normalization, validation
  and the wire format shared by the clients.

[Unreleased]: https://github.com/revenexx/beats-sdks/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/revenexx/beats-sdks/releases/tag/v0.1.0
