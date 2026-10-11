<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Security

## Reporting a vulnerability

Please report it privately, not in a public issue: use GitHub's
[**Report a vulnerability**](https://github.com/light-vp/Anigram/security/advisories/new)
on this repo's Security tab. Say what you found, how to reproduce it, and
what it lets someone do. You will get a reply, and credit in
the advisory when it is fixed, if you want it.

## What's in scope

- **The app** at anigram.vaibhav.co.uk: a scene arrives from a link
  (`#scene=`), a file or storage, and is untrusted. Anything that lets a scene
  run script, read another origin, or hang the tab is a vulnerability.
- **The MCP server** (`anigram-mcp` on npm): it reads and writes files for an
  assistant. Anything that lets a tool call reach outside the working
  directory, or run a command, is a vulnerability.
- **The release path**: the npm package is staged by CI over Trusted
  Publishing and goes live only on a maintainer's 2FA approval (see
  [RELEASING.md](RELEASING.md)). A way around that is in scope.

## Supported versions

Fixes go into the latest release only. Update with
`npx -y anigram-mcp@latest`; the app is always the latest.
