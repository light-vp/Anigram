<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Releasing

`anigram-mcp` is published to npm by `.github/workflows/publish-mcp.yml`,
and only when a maintainer pushes a tag. Merging to `main` never publishes.
There is no npm token anywhere: the workflow uses npm's
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers), which lets
it stage a release because it can prove it is this repository's run. A
staged release is not live until a maintainer approves it with 2FA, so a
stolen CI credential can never ship a version on its own.

## Once: the first publish, by hand

npm can only name a trusted publisher for a package that already exists, so
the very first version goes up from a maintainer's own machine, with their
own login and 2FA:

```sh
git pull && npm ci && npm run test:mcp
cd mcp && npm login && npm publish --access public
```

`npm pack` and `npm publish` build `mcp/dist` first (the `prepack` script),
so a package can't go up without the server in it. `npm pack --dry-run` in
`mcp/` lists what would ship.

Then, on npmjs.com, open the `anigram-mcp` package → **Settings** →
**Trusted Publisher** → **GitHub Actions**, and enter:

| Field             | Value             |
| ----------------- | ----------------- |
| Organization/user | `light-vp`        |
| Repository        | `Anigram`         |
| Workflow filename | `publish-mcp.yml` |
| Environment       | `npm`             |

Leave **Allow npm publish** and **Allow npm dist-tag** unticked. The
workflow only runs `npm stage publish`, which is always allowed.

Optional, and worth it: on the same settings page, set publishing access to
require 2FA and disallow tokens, so only the trusted workflow (or you, with
2FA) can publish. In GitHub, Settings → Environments → `npm` can also list
you as a required reviewer, so every publish waits for a click.

## Each release

1. In a PR: bump `version` in both `package.json` and `mcp/package.json`
   (one version for the app and the package; semver: a new tool, option or
   part is a minor, a fix is a patch), and turn the changelog's
   **Unreleased** section into a heading for that version. `npm run
version:check` (in CI) fails until all three agree. Merge it.
2. Tag the merge commit and push the tag:

   ```sh
   git tag mcp-v0.2.0 && git push origin mcp-v0.2.0
   ```

3. The workflow checks the tag matches the package version, runs every
   check and the stdio smoke tests, then stages the release. npm adds a
   provenance statement linking the package to that run.
4. Approve it: on npmjs.com, or from your machine with
   `npm stage approve <stage-id>` (asks for 2FA). The ID is a UUID, not the
   version: the run's "Stage the release" step prints it, and
   `npm stage list anigram-mcp` lists it. Until then nobody can install it.

`npx -y anigram-mcp --version` prints the published version.

## Before a release: the eval

`npm run eval` gives every prompt in `eval/prompts.json` to a real
assistant with only this server to use, and scores what it made: valid,
tells its story, right first time, looked at its drawing. It spends real
tokens (roughly $0.35 a prompt), so run it before a release or after
changing the guide or a tool description, not on every PR. Compare against
the committed baseline in `eval/baseline.json`.
