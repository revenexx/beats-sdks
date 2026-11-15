# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

To record a change for the next release, run:

```bash
pnpm changeset
```

Pick the packages, a bump (patch/minor/major) and describe the change. All
`@revenexx/beats-*` packages are one fixed group, so they always move to the
same version. On push to `main`, the Release workflow opens (or updates) a
**"Version Packages"** PR; merging it bumps the versions, writes the
changelogs, and publishes to npm via OIDC
[trusted publishing](https://docs.npmjs.com/trusted-publishers), no token.
