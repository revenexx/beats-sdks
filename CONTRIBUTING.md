# Contributing

Issues and pull requests are welcome. For a bug, an issue with the package,
version, browser or runtime and a short reproduction helps most. For a larger
change, open an issue first so we can agree on the approach before you put
time into it.

Please report security problems privately, not as an issue: see
[SECURITY.md](SECURITY.md).

## Setup

Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the browser tests
pnpm run check                          # build, lint, types, all tests, size budgets
```

`pnpm run check` is what CI runs. The [README](README.md#development) lists
the individual commands and the layout of the browser client.

## What a change needs

- **A test that fails without it.** Unit tests are in `packages/*/test`,
  the browser tests (Playwright, Chromium) in `packages/browser/e2e`.
- **The size budgets.** `beats.js` is the script-tag build most sites load;
  it has a gzip budget of 2 KB and almost no room left. New browser features
  go into a plugin (`packages/browser/src/plugins`) that only the full build
  includes.
- **Compatibility with the server.** The wire format in
  `packages/core/src/protocol.ts` and the event types in
  `packages/core/src/types.ts` are what a beats server accepts. Changing
  them needs a matching server release; say so in the pull request.
- **Documentation** in `README.md` or `docs/usage.md` for every
  user-visible change, and a changeset (`pnpm changeset`) that describes it
  for the changelog; see [docs/releasing.md](docs/releasing.md).
- **Plain commit messages**: an imperative subject line ("Add …", "Fix …")
  and a body that explains why.

Pull requests are squash-merged once CI is green and a maintainer has
reviewed them.

## Code of conduct

This project follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contribution is licensed under the
[MIT license](LICENSE), like the rest of the project.
