<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Releasing the MCP server

`anigram-mcp` is published to npm by `.github/workflows/publish-mcp.yml`,
and only when a maintainer pushes a tag. Merging to `main` never publishes.
There is no npm token anywhere: the workflow uses npm's
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers), which lets
it publish because it can prove it is this repository's run.

## Once: the first publish, by hand

npm can only name a trusted publisher for a package that already exists, so
the very first version goes up from a maintainer's own machine, with their
own login and 2FA:

```sh
git pull && npm ci && npm run test:mcp
cd mcp && npm login && npm publish --access public
```

Then, on npmjs.com, open the `anigram-mcp` package → **Settings** →
**Trusted Publisher** → **GitHub Actions**, and enter:

| Field             | Value             |
| ----------------- | ----------------- |
| Organization/user | `light-vp`        |
| Repository        | `Anigram`         |
| Workflow filename | `publish-mcp.yml` |
| Environment       | `npm`             |

Optional, and worth it: on the same settings page, set publishing access to
require 2FA and disallow tokens, so only the trusted workflow (or you, with
2FA) can publish. In GitHub, Settings → Environments → `npm` can also list
you as a required reviewer, so every publish waits for a click.

## Each release

1. Bump `version` in `mcp/package.json` (semver: a new tool or option is a
   minor, a fix is a patch) in a PR, and merge it.
2. Tag the merge commit and push the tag:

   ```sh
   git tag mcp-v0.2.0 && git push origin mcp-v0.2.0
   ```

3. The workflow checks the tag matches the package version, runs every
   check and the stdio smoke tests, then publishes. npm adds a provenance
   statement linking the package to that run.

`npx -y anigram-mcp --version` prints the published version.

## Before a release: the eval

`npm run eval` gives every prompt in `eval/prompts.json` to a real
assistant with only this server to use, and scores what it made: valid,
tells its story, right first time, looked at its drawing. It spends real
tokens (roughly $0.35 a prompt), so run it before a release or after
changing the guide or a tool description, not on every PR. Compare against
the committed baseline in `eval/baseline.json`.
