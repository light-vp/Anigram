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
npm run format     # prettier --write .
```

Before opening a PR, make sure `typecheck`, `lint`, `test`, `test:mcp` and
`build` all pass.

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
