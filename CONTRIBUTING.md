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
npm run format     # prettier --write .
```

Before opening a PR, make sure `typecheck`, `lint`, and `build` all pass.

## Architecture rules (please respect these)

These keep the project extensible; they are enforced in review (and some by lint):

1. **The engine stays domain-agnostic.** Nothing under `src/engine/` may import
   from `src/packs/` or `src/app/`. Domain knowledge lives in packs and reaches
   the engine only as data via `registerPack()`. (Enforced by oxlint.)
2. **No hardcoded colours.** Every colour/geometry value comes from a token in
   `src/styles/tokens.css` (or a theme file). No raw hex/rgb anywhere else. This
   protects the theming/custom-theme seam.
3. **One open format.** All animation authoring (preset params, the future visual
   composer, future plugins) reads and writes the same `AnimationSpec`. Don't
   fork a second animation representation.
4. **Reduced motion is first-class.** Every animated interaction must degrade to a
   legible static indicator.

## SPDX headers

Every source file starts with:

```
// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel
```

(Use `/* ... */` for CSS and `<!-- ... -->` for Markdown/HTML.)

## Commit / branch conventions

Branch `feature/…`, `fix/…`, or `docs/…`; open a PR; keep commits focused.
