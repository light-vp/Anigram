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

### Added

- **Send feedback.** Help → Send feedback… opens a short form that mails
  the note to the author, with an optional address for a reply.
- **An examples gallery.** `?examples` (and **Examples** in the header) is
  now a page of every example sheet: the six built-in sheets, the scene
  files in `examples/` and the single-line and PFD starters, each drawn as
  a thumbnail, filtered by kind of drawing, with **Run**, **Static** and
  **Edit**. A sheet still runs on its own at `?scene=<id>`.
- **A rainwater harvesting P&ID**, `examples/rainwater-pid.json`, written by
  Claude Code through the MCP server from a one-paragraph brief.
- **Sketchbook and Night themes.** Sketchbook is cream paper, manga ink, a
  sakura neon for trouble and a highlighter for what's lit, under a fine
  film grain, taken from vaibhav.co.uk. Night is the same palette in warm
  black. `?theme=sketchbook|night`, the `<living-diagram>` `theme`
  attribute, and the MCP server's `theme` option all take them, alongside
  `light` and `dark`.

### Changed

- **The app opens in Sketchbook.** The editor, the examples and the docs
  now open in Sketchbook, and the wall screen opens in Night. **View** in
  the editor, and the colour switch on a running sheet, offer all four
  themes and remember your pick. Embeds still default to white, and so do
  exports and MCP renders. `?theme=cream` now means Sketchbook, not White.
- **Gallery thumbnails follow the theme** instead of always being white.

- **An event can leave out `then`.** It then only marks a moment ("the tank
  is full"): it fires, is lit and told on the sheet and in the storyboard,
  and sets nothing. Before, an assistant had to invent a switch for it to
  flip.

### Fixed

- **`render_storyboard` recordings are drawn on several threads**, so a
  default MP4 that took about two minutes on four cores takes under fifty
  seconds (and less with more cores), inside an MCP client's usual
  time limit. The tool also reports its progress, frame by frame, to a
  client that asks. The files are the same as before, byte for byte.
- **Parts a drawing doesn't draw yet show what they are.** In the editor, a
  P&ID pump placed before it is on a process line, or the power supply it
  brings with it, was an empty dashed box. It now shows its symbol, says
  whether it waits for a line or is left off the drawing on purpose, and
  shows when it is selected. The square under an armed palette item, and
  a part being dragged, show the part as the sheet draws it.
- **Level loops open the day on the tank's real level.** `prev()` of a
  store before the first tick read it as empty, so a control valve on a
  level loop showed shut at the opening hour, and a storyboard's first
  panel showed nothing flowing.
- **Storyboard panels of an engineering drawing** no longer cut through its
  border and the top of its title block.
- **A line drawn in the editor on a P&ID or PFD gets the next line or
  stream number**, and new lines steer round instrument bubbles and their
  signal lines instead of running through them.
- **The editor's side panel**: a long title wraps rather than running off
  the edge, the tag hint is the next free tag, and a valve not yet linked
  reads in the sheet's units rather than kW.

## 0.4.0

Storyboards and day recordings, 35 more P&ID symbols with valve actuators and signal lines, static drawings, a P&ID evaluation, and the editor laid out like a desktop app.

### Added

- **Storyboards.** The moments that tell a sheet's day, picked from what the
  simulation really did: the first time each event fires (a chain that
  loops is told once) and the captions between. Each panel is the drawing
  at that moment with its time and what happened.
- **GIF and MP4.** The day recorded: the clock stops for two seconds at
  each moment, with what happened written under the sheet while the flows
  keep moving, then glides to the next at no more than an hour of the day
  a second; a long quiet stretch is cut behind a dip to paper. MP4 at 30 fps and 1280 wide, GIF at
  15 fps. In the app: **▤ storyboard** on any sheet, or **storyboard** in the
  editor; made in the browser (MP4 through WebCodecs), nothing uploaded.
- `render_storyboard`, the same from an assistant: the board as a PNG to look
  at, an SVG or a PDF, or `out: "day.gif"` / `"day.mp4"` (MP4 needs ffmpeg).
  `at` picks the hours; `from`, `to`, `seconds`, `fps` and `hold` shape it.
- **A P&ID evaluation** (`eval/pid/`): 31 scenarios, 15 of them on DEXPI
  e.V.'s public example P&IDs, run blind with and without the MCP server
  and graded by script, with the results in the docs.
- **Static drawings.** A sheet can be shown with nothing moving: no clock,
  no readings, and an engineering drawing at rest (vessels empty, valves in
  their rest position, directional valves on their springs, relief valves
  shut), the way a P&ID is printed and filed. In the editor it is
  **View → Static drawing**; in a link or an embed, `?mode=static` (or
  `mode="static"` on `<living-diagram>`); on the examples page, **static**;
  from an assistant, `render_scene` with `static: true` and `share_link`
  with `view: "static"`.
- **The P&ID evaluation, drawn**: the docs' evaluation page now shows every
  scenario's brief with what the assistant drew with Anigram and without it,
  side by side, with scores, time, tokens and cost. Open a pair to compare
  them full size, or run the Anigram sheet live.
- **35 more P&ID symbols**, drawn after ISO 10628-2 and ISA-5.1 and named
  for DEXPI's classes. Machines: `RotaryPump`, `Ejector`, `StaticMixer`.
  Vessels and columns: `OpenTank`, `HorizontalVessel`, `SphericalTank`,
  `Silo`, `Reactor` (its agitator turns), `ProcessColumn` (trayed),
  `PackedColumn`, `Cyclone`; each shows its level. Heat transfer:
  `TubularHeatExchanger`, `PlateHeatExchanger`, `AirCoolingSystem` (its fan
  turns), `Furnace`, `CoolingTower` (water falls while it works). Valves:
  `PlugValve`, `NeedleValve`, `DiaphragmValve`, `AngleValve`,
  `ThreeWayValve`, `PressureReducingValve`, `BreatherValve`, `RuptureDisc`.
  Fittings and line ends: `Strainer`, `FlameArrestor`, `SteamTrap`,
  `SightGlass`, `RestrictionOrifice`, `PipeReducer`, `FlexibleHose`,
  `BlindFlange`, `Funnel`, `Vent`, `Silencer`. All are in the editor's
  palette, the MCP guide and the drawing checks' tag letters, and go to and
  from DEXPI and SFILES as their own classes.
- **Valve actuators and fail positions.** A part's `actuator` (`diaphragm`,
  `motor`, `solenoid`, `piston`, `hand`) is drawn on any P&ID valve's stem,
  and `fails` (`open`, `closed`, `last`) writes FO, FC or FL beside it.
- **ISA-5.1 signal lines:** `hydraulic`, `capillary` and `electromagnetic`,
  for a link's `line` or an instrument's `signal`, each with its marks; the
  legend now shows a line's marks too.
- **A distillation column example**, `examples/distillation-pid.json`.

### Fixed

- `import_dexpi` keeps the loop number of an instrument function numbered
  with a trailing dot (`031.`, as in DEXPI's I05 ratio loop) instead of
  numbering it afresh.

### Changed

- **The editor is laid out like a desktop app.** A menu bar along the top
  (File, Edit, View, Help) replaces the row of buttons: starters, open,
  save, links and the storyboard are under File; undo, redo, delete and
  auto layout under Edit; animated or static, light or dark under View;
  the docs, the MCP server, the examples, GitHub and support under Help.
  The parts sit down the left, the sheet fills the middle with its clock
  underneath, and the selected part's settings run down the right. ⌘O
  opens a file and ⌘S saves it.

## 0.3.0

Real plants in, pressure and voltage, event chains, fluid-power circuits, an embeddable element, and the editor as the home page.

### Added

- **DEXPI import.** `import_dexpi` opens a DEXPI 1.3 (Proteus XML) P&ID as
  a living P&ID: equipment with its tags, each piping segment as lines with
  its valves in place, off-page connectors, and instrument loops with the
  valves they drive. DEXPI's own reference P&ID opens and runs. Behaviours
  are guessed from each class and the notes say which.
- **SFILES 2.0.** `import_sfiles` opens a flowsheet string as a living PFD
  laid out by its flow; `export_sfiles` writes any scene's process streams
  as one.
- **Docs in the app** (`?docs`): how the drawings run, the editor, the MCP
  server with its setup and every tool, scene files, engineering drawings,
  import and export, the URL API, and development notes.
- **P&ID symbols:** `ButterflyValve` (its disc turns as it shuts) and
  `SafetyValve`, both also exported to DEXPI.
- **Fluid-power circuits** (`"drawing": "fluid-power"`): hydraulic and
  pneumatic circuit diagrams with ISO 1219-1 symbols, laid out and tagged
  after ISO 1219-2 (`0P1`, `1V1`, `1A1`). Pumps, motors and compressors;
  double- and single-acting cylinders whose piston follows their stroke;
  4/3, 4/2, 5/2 and 3/2 directional valves that shift envelope as they
  switch; relief, reducing, non-return, throttle, flow-control and shuttle
  valves; filters, reservoirs, accumulators, service units, silencers and
  gauges. Working lines solid, pilot and drain lines dashed, shafts double.
  Pictorial parts to match (`cylinder`, `powerpack`, `dcv`, `accumulator`,
  `compressor`, `motor`, `oiltank`), a `draw-fluid-power` prompt, a
  hydraulic press starter (also `examples/hydraulic-press.json`) whose
  relief valve holds the line at 150 bar, and
  checks that oil returns to a reservoir, a pump has a relief valve before
  its directional valve, and exhaust air leaves through a silencer.
  `auto_layout` lays a circuit out bottom to top (`direction: "up"`).
- `npm run bench` times the solver on a 288-part town.
- **`<living-diagram>`**, a web component for pages that can't use an
  iframe: one script, then `<living-diagram src="plant.json">` (or
  `scene=`, `share=`, or the scene inline). It runs in its own shadow root,
  sizes to the sheet, follows `theme="auto"`, and shows what's wrong with a
  bad scene instead of a blank box. No analytics.
- Embeds take `?paused=1` and `?controls=0`.
- **Effort: pressure, voltage and temperature.** Alongside how much flows, a
  part can now carry how hard it pushes: give it `effort` (`set` for a
  source or tank, `boost` for a pump, `ratio` for a transformer, `drop` for
  a valve) and a link a `drop` at capacity (square law for fluids, linear
  for cables and heat). Readouts appear under the part, `min`/`max` raise
  alarms, and expressions read `part('id').effort`. Units default to bar,
  V and °C (`units.<domain>.effort`).
- **Relief valves.** A gate with `relief: { at, full }` opens as the
  pressure upstream passes `at`, solved to equilibrium each tick so it
  holds steady instead of chattering.
- **Event chains.** `events` on a scene: each watches a condition, waits
  its `after`, then flips a switch or sets a knob, and the next event
  watches for it with `fired('id')` or `since('id')`. The sheet draws the
  chain as arrows between parts and a ring where each fires; the caption
  says what just happened. `simulate_scene` reports when each fired.
- **A garden that waters itself** (LD-006), a built-in sheet for event
  chains and pressure: sun starts the pump, a float stops it, a timer opens
  the sprinkler.
- `oil` and `air` domains, for hydraulic and pneumatic circuits.

### Changed

- **The editor is the home page.** anigram.vaibhav.co.uk opens on the
  editor, on the sheet you left; the five built-in sheets moved to
  `?examples`. Links to a sheet (`?scene=`, `#scene=`) still open it running,
  and `?build=1` still opens the editor. One header across the editor, the
  examples and the docs.
- **The solver is ten times faster** on big sheets: 0.2 ms a tick at 300
  parts (was 2.1 ms). When there isn't enough to go round, consumers of
  equal priority now share the shortfall fairly (max-min) instead of the
  first in the file taking all it wants.
- An embed's "source ↗" link sits in its play bar instead of over the
  sheet's corner, where it covered the clock.
- The water tower sheet shows the pressure at the taps, which falls when
  the hydrant is open.
- Instrument tags may carry a dotted loop number, `PV-4712.02`, as DEXPI
  files write them.

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
