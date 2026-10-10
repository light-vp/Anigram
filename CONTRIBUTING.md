<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Contributing to Anigram

Thanks for your interest! Contributions are welcome.

## Contributor License Agreement (required)

Anigram is dual-licensed (AGPL-3.0 **and** a commercial license). To be
able to offer the commercial license, the project must hold the rights to
relicense the entire codebase. **Every contribution therefore requires a signed
[CLA](CLA.md)** granting the author a broad, irrevocable license (including the
right to sublicense under the commercial license).

Your first pull request will be checked for a CLA acceptance; without it we
cannot merge your code. This is not optional — a single un-CLA'd contribution
would make the commercial offering impossible.

## Development

```sh
npm install
npm run dev        # dev server
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # the simulation's rules, in node's own test runner
npm run format     # prettier --write .
```

Before opening a PR, make sure `typecheck`, `lint`, `test` and `build` all pass.

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
5. **Scenes are data.** A new scene is one file in `src/scenes/` plus a line in
   its index; run it through a day with `npm run simulate <id>` before
   shipping it, and check the story its captions tell is the one the numbers
   tell.

## SPDX headers

Every source file starts with:

```
// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel
```

(Use `/* ... */` for CSS and `<!-- ... -->` for Markdown/HTML.)

## Commit / branch conventions

Branch `feature/…`, `fix/…`, or `docs/…`; open a PR; keep commits focused.
