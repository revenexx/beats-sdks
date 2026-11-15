# Changelog

Each package keeps its own changelog, written by
[Changesets](https://github.com/changesets/changesets) when a release is
versioned:

- [`@revenexx/beats-browser`](packages/browser/CHANGELOG.md)
- [`@revenexx/beats-node`](packages/node/CHANGELOG.md)
- [`@revenexx/beats-vue`](packages/vue/CHANGELOG.md)
- [`@revenexx/beats-nuxt`](packages/nuxt/CHANGELOG.md)
- [`@revenexx/beats-react`](packages/react/CHANGELOG.md)
- [`@revenexx/beats-core`](packages/core/CHANGELOG.md)

The packages use [semantic versioning](https://semver.org/) and all share one
version. Before 1.0, minor versions may change the API; the changelog says
when and how to migrate. Changes that are not released yet are the files in
[`.changeset/`](.changeset/).

0.1.0 is the first version published as `@revenexx/beats-*`. The clients were
developed in the beats repository under the provisional, never published
scope `@beats-analytics`; this repository continues their history.
