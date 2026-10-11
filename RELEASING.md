<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Releasing the MCP server

`anigram-mcp` is published to npm by `.github/workflows/publish-mcp.yml`,
and only when a maintainer pushes a tag. Merging to `main` never publishes.

## Once

1. On npmjs.com, sign in as the account that should own the package and
   create a **granular access token** with read and write access to
   `anigram-mcp` (for the very first publish, to all packages, since the
   name doesn't exist yet).
2. In the GitHub repository, add it under Settings → Secrets and variables →
   Actions as `NPM_TOKEN`.
3. Optional: under Settings → Environments → `npm`, add yourself as a
   required reviewer, so every publish waits for a click.

## Each release

1. Bump `version` in `mcp/package.json` (semver: a new tool or option is a
   minor, a fix is a patch) in a PR, and merge it.
2. Tag the merge commit and push the tag:

   ```sh
   git tag mcp-v0.2.0 && git push origin mcp-v0.2.0
   ```

3. The workflow checks the tag matches the package version, runs every
   check and the stdio smoke tests, then publishes with a provenance
   statement linking the package to that run.

`npx -y anigram-mcp --version` prints the published version.

## Before a release: the eval

`npm run eval` gives every prompt in `eval/prompts.json` to a real
assistant with only this server to use, and scores what it made: valid,
tells its story, right first time, looked at its drawing. It spends real
tokens (roughly half a dollar a prompt), so run it before a release or after
changing the guide or a tool description, not on every PR. Compare against
the last committed baseline in `eval/baseline.json`.
