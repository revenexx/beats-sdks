# Releasing

All packages share one version and are released together.

1. Open a pull request that sets `version` in every `packages/*/package.json`
   to the new version and moves the `[Unreleased]` entries of
   `CHANGELOG.md` to a section `## [<version>] - <date>`.
2. Merge it once CI is green.
3. Tag the merge commit and push the tag:

   ```sh
   git tag v<version> && git push origin v<version>
   ```

The [release workflow](../.github/workflows/release.yml) checks that every
package has the tag's version, runs the full check, publishes the packages
to npm (core first) with provenance, and creates the GitHub release from the
changelog section. Versions `0.x` are marked as pre-releases. Re-running the
workflow for the same tag publishes only what is still missing.

## Authentication

The workflow uses **npm trusted publishing** (OIDC): GitHub proves to npm
which repository and workflow is publishing, and no token is stored. Each
package needs a trusted publisher on npmjs.com (package → Settings → Trusted
publishing → GitHub Actions):

| Field | Value |
| --- | --- |
| Organization or user | `revenexx` |
| Repository | `beats-sdks` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

npm can only add a trusted publisher to a package that exists, so the
**first** release of a new package name is published with a token: an npm
granular access token with read and write access to the `@revenexx` scope,
stored as the repository secret `NPM_TOKEN`. When the secret is set, the
workflow uses it (and says so in the run). After the first release, add the
trusted publishers, then delete the secret and revoke the token.

Requirements of trusted publishing, met by the workflow: `id-token: write`,
npm CLI 11.5.1 or later (pinned in the workflow), Node.js 22.14.0 or later.
