<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Contributing to Anigram

Thanks for your interest! Contributions are welcome.

Anigram is MIT licensed, and so is everything you contribute — no CLA to
sign. By opening a pull request you agree your change ships under the
[MIT License](LICENSE).

## Development

```sh
npm install
npm run dev        # dev server
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # the simulation's rules, in node's own test runner
npm run test:mcp   # build the MCP server and drive it over stdio
npm run eval       # a real assistant builds sheets with the server (costs tokens)
npm run e2e -- --ignore-snapshots  # browser tests (after npm run build)
npm run docs       # rewrite the reference docs after changing a part, symbol or tool
npm run format     # prettier --write .
```

Before opening a PR, make sure `typecheck`, `lint`, `test`, `test:mcp`,
`build`, the browser tests and `docs:check` all pass. If people will notice the change,
add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).

CI also compares each sheet with a picture in `e2e/screenshots/`. Those
pictures are taken inside Playwright's Docker image, because font rendering
differs from one machine to the next, so locally the browser tests skip them
(`--ignore-snapshots`). If your change is meant to alter how a sheet looks,
push a commit with `[update screenshots]` in its message: CI records the new
pictures and commits them to your branch, and the PR shows them beside the
old ones.

`npm test` includes **golden days**: each built-in sheet's hour-by-hour run,
committed in `test/golden/`. If your change is meant to alter what a sheet
does, run `npm run golden:update` and commit the updated files, so the
difference is visible in review.

## Architecture rules (please respect these)

These keep the project extensible; they are enforced in review (and some by lint):

1. **Nothing moves unless the simulation says so.** Every animated pixel on
   the sheet is read off `src/sim` state — a flow, a level, a phase. No
   keyframes, no decorative loops. If a glyph needs to move, give it the state.
2. **`src/sim/` is the rulebook, and it stays React-free.** It must run headless
   in node (`npm test`, `npm run simulate`). It may not import from `view/`,
   `parts/` or `app/`. (Enforced by oxlint.)
3. **No hardcoded colours.** The chrome reads tokens from
   `src/styles/tokens.css`; the drawing sheet reads its palette from
   `src/view/palette.ts` (it lives inside the SVG so exports carry it). No raw
   hex/rgb anywhere else.
4. **Reduced motion is first-class.** Without motion, every flow is labelled with
   its value and direction instead — the same view paper mode prints.
5. **Scenes are data.** A scene must survive `JSON.stringify`: signals are
   expression strings, never functions. A new built-in sheet is one file in
   `src/scenes/` plus a line in its index; run it through a day with
   `npm run simulate <id>` before shipping it, and check the story its
   captions tell is the one the numbers tell.
6. **The MCP server is the first client.** Anything a person can do to a
   scene in the app should be doable through a tool, and a tool's errors
   should say what to change, against the part they belong to.

## SPDX headers

Every source file starts with:

```
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel
```

(Use `/* ... */` for CSS and `<!-- ... -->` for Markdown/HTML.)

## Commit / branch conventions

Branch `feature/…`, `fix/…`, or `docs/…`; open a PR; keep commits focused.
