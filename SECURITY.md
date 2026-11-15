# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

Until 1.0, only the latest minor release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Report vulnerabilities privately, either

- through GitHub: **Security → Report a vulnerability** on
  <https://github.com/revenexx/beats-sdks/security/advisories/new>, or
- by e-mail to **security@revenexx.com**.

Include what you found, how to reproduce it, the package and version, and
the impact you expect. We acknowledge reports within two working days. Fixes
are released as soon as they are ready, with a GitHub security advisory
crediting the reporter unless you prefer otherwise.

## Scope

In scope: the packages in this repository (`@revenexx/beats-*`) as published
on npm, and the release workflow that publishes them. Findings in a beats
server go to the same address.

## What the clients send and store

The ingest key (`bk_...`) is public by design: it identifies a project and
only allows sending events. In their default cookieless mode the browser
clients set no cookies and use no browser storage; see the privacy notes in
[docs/usage.md](docs/usage.md#privacy-notes).
