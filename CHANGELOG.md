<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Changelog

What changed in each release, for people using the app, embedding a sheet,
or building with the MCP server. One version number covers all three: the
app, the `anigram-mcp` npm package, and this repo. The scene file format has
its own number (`"anigram": 1`, [schema](schema/scene.v1.json)), which only
moves when an old file would stop opening; every release so far reads
format 1.

Versions follow [semver](https://semver.org): a new tool, option or part is
a minor release, a fix is a patch. Until 1.0, a minor release may also
change something an assistant or an embed relies on; when it does, the
entry says so under **Changed**.

## Unreleased

## 0.2.0

Engineering drawings, an editor for scene files, and a release process.

### Added

- **Engineering drawings.** A scene can be drawn as a P&ID (ISO 10628-2
  symbols, ISA-5.1 tags and lines), a single-line diagram (IEC 60617 or
  ANSI/IEEE 315) or a process flow diagram, as well as the pictorial sheet:
  set `drawing` on the scene. One scene, several drawings.
- **Instruments on a P&ID.** ISA-5.1 bubbles that read live values, and
  control loops that drive a valve or a pump.
- **Title block and PDF.** Engineering sheets carry an ISO 7200 title block
  and print as one page of ISO A paper.
- **Physics checks.** Validation warns about a machine made from nothing, a
  converter over 100% efficient, or a round trip that comes back bigger.
- **MCP tools:** `new_scene` (a starter for each drawing practice),
  `check_drawing` (the practice's rules: tags, line numbers, symbols),
  `lint_layout` and `auto_layout` (crossed lines, crowded labels, labels off
  the sheet, and a fix),
  `export_dexpi` (a P&ID as DEXPI 1.3 Proteus XML), and one prompt per
  practice (`draw-pid`, `draw-single-line`, `draw-pfd`, `draw-sheet`).
- **The editor** (`?build=1`) edits the scene file itself: place parts from
  the practice's palette (tagged as they land), drag to connect, write
  signals with live checking, undo and redo, save the file, copy a link.
  Opens any sheet with **✎ edit**.
- `share_link` can open a scene in the editor (`view: "editor"`).
- **Reference docs** in [docs/reference/](docs/reference/): every part,
  every symbol in each symbol set, and every MCP tool with a real call.
- **Browser tests** for the app, the embeds and the editor, and a
  screenshot of every built-in sheet in each drawing type, on every PR.
- **Goes live on its own.** The portfolio's deploy now checks every 30 minutes for a new merge here and redeploys anigram.vaibhav.co.uk when there is one.

### Changed

- The old build-your-own playground and its format are retired. Its saved
  sheets and `#sheet=` links open in the editor as scene files, unchanged.

## 0.1.1

The first release of `anigram-mcp` on npm (0.1.0 went up empty and is
deprecated), and everything open-sourced under MIT up to then:

- The scene format, version 1: parts, links and signals as plain JSON, with
  a JSON Schema, strict validation and golden days for every built-in sheet.
- Five built-in sheets: a power grid, a solar home, a town's water, a hydro
  dam and a data centre.
- The workbench, `?embed=1` for iframes, `?screen=1` for a wall, paper mode
  for printing, and `#scene=` links that carry a whole scene.
- The MCP server: write, validate, simulate, check and draw scenes, with
  stories as tests (`expect`, `check_scene`) and PNG rendering. Releases are
  staged by CI and approved with 2FA.
