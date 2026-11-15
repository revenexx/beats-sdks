# Releasing

Releases are made with [Changesets](https://github.com/changesets/changesets),
the same way as the other public `@revenexx` npm packages
(`consent-manager-nuxt`, `captcha-nuxt`, `tag-manager-nuxt`,
`storage-nuxt-image`). All six packages are one **fixed** group
(`.changeset/config.json`): they always share a version, and a release
bumps all of them, even those without a change of their own.

## Day to day

1. In the pull request with a user-visible change, add a changeset:

   ```sh
   pnpm changeset
   ```

   Pick the packages the change touches, the bump (patch, minor, major) and
   write one or two sentences for the changelog. The file lands in
   `.changeset/`; commit it with the change.
2. Merge the pull request once CI is green.
3. The [release workflow](../.github/workflows/release.yml) runs on every
   push to `main`. With pending changesets it opens or updates a pull request
   **"Version Packages"** (branch `changeset-release/main`), which sets the
   new version in every `packages/*/package.json` and writes the entries of
   `packages/*/CHANGELOG.md`.
4. Merge the Version Packages pull request once its CI is green. The
   workflow then builds the packages and runs `changeset publish`: every
   package whose version is not on npm yet is published with provenance,
   and a git tag and GitHub release are created per package.

A push to `main` with no changesets and nothing unpublished does nothing.
Re-running the workflow is safe: versions already on npm are skipped.

## Authentication

The workflow uses **npm trusted publishing** (OIDC): GitHub proves to npm
which repository and workflow is publishing, and no token is stored; there
is no `NPM_TOKEN` secret. Requirements, met by the workflow: `id-token:
write`, npm CLI 11.5.1 or later (`npm install -g npm@latest`), Node.js
22.14.0 or later. Provenance is on (`publishConfig.provenance`): this
repository is public, so npm records which commit and workflow built each
version.

The Version Packages pull request is opened with a token of the
revenexx release bot (GitHub App, org secrets `REVENEXX_RELEASEBOT_APP_ID`
and `REVENEXX_RELEASEBOT_APP_PRIVATE_KEY`), because a pull request opened
with `GITHUB_TOKEN` would not start CI.

## One-time setup: the first publish (0.1.0)

npm can only add a trusted publisher to a package that already exists, so
the first version of each package is published by hand, once. Until then,
the workflow only opens the Version Packages pull request for 0.1.0;
**do not merge it before the steps below are done**, or its publish step
fails.

1. Log in to npm with an account that may publish to the `@revenexx` scope
   (two-factor authentication on):

   ```sh
   npm login
   npm whoami
   ```

2. Check out the Version Packages branch (every package at 0.1.0), install
   and build:

   ```sh
   git fetch origin changeset-release/main
   git switch changeset-release/main
   pnpm install --frozen-lockfile
   pnpm run build
   ```

3. Pack and publish each package, core first. `pnpm pack` replaces the
   `workspace:*` ranges with `0.1.0`. `--provenance=false` is needed because
   provenance can only be generated in CI; it overrides
   `publishConfig.provenance` for this one publish. Each `npm publish` asks
   for a one-time password (or pass `--otp <code>`).

   ```sh
   mkdir -p /tmp/beats-pack
   for p in core browser node vue react nuxt; do
     (cd packages/$p && pnpm pack --pack-destination /tmp/beats-pack)
   done
   for p in core browser node vue react nuxt; do
     npm publish /tmp/beats-pack/revenexx-beats-$p-0.1.0.tgz \
       --access public --provenance=false
   done
   for p in core browser node vue react nuxt; do
     npm view @revenexx/beats-$p@0.1.0 version
   done
   ```

4. Add the trusted publisher to each of the six packages on npmjs.com
   (package, Settings, Trusted publishing, GitHub Actions):

   | Field | Value |
   | --- | --- |
   | Organization or user | `revenexx` |
   | Repository | `beats-sdks` |
   | Workflow filename | `release.yml` |
   | Environment | (empty) |

   Then, on the same settings page, set **Publishing access** to "Require
   two-factor authentication and disallow tokens", so only the workflow can
   publish from now on.

5. Merge the Version Packages pull request. The workflow finds 0.1.0 already
   on npm for every package and publishes nothing, so it creates no tags or
   GitHub releases for 0.1.0. To add the tags by hand (optional), from an
   up-to-date `main`:

   ```sh
   pnpm changeset tag
   git push origin --tags
   ```

From 0.1.1 on, every release goes through the workflow with provenance.
