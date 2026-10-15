<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Roadmap

The thesis: **a diagram should be the system, running.** Every pixel that
moves is read off a simulation, so the drawing can't lie, and the same sheet
works on a web page, on paper and on a wall.

The direction: **MCP-first, open source.** Most diagrams will be written by a
coding assistant from a sentence, then checked, tuned and shared by people.
So every capability lands as an MCP tool first and a button second, the
scene file is the contract between them, and the whole thing is MIT licensed
so anyone can fork it, embed it or build a business on it.

## Now

- **The living drawing.** A React-free flow solver — sources, demands,
  junctions, gates, converters with recipes and losses, stores, vents — and
  ~40 engineering glyphs that read their motion off it. Five sheets: the
  power grid, a solar house, a town's water, a hydroelectric dam, a data
  centre. Live, paper, light, dark, embed and wall-screen views.
- **The scene file.** Plain JSON, with signals as small safe expressions
  (`"32 * sun(hour) * (1 - 0.85 * knob('cloud'))"`). A validator whose errors
  name the part they're about. Open, save and share scene files in the app;
  a whole scene fits in a link.
- **The MCP server.** Guide, validate, write, edit, simulate a day, render
  SVG, share link — an assistant can go from a paragraph to a checked,
  drawn, shareable sheet without a browser.
- **MIT licence.** No CLA, no commercial tier. A sponsor link for people who
  want to support it.

## Next — assistants build, people refine

- **`anigram-mcp` on npm**, so setup is one line: `npx -y anigram-mcp`.
- **Live preview.** A `preview` tool that serves the scene file locally and
  reloads the browser on every edit, so you watch the assistant draw.
- **Layout help.** A tool that proposes positions and `via` waypoints for a
  set of parts and links, and flags crossings and labels that collide —
  layout is the part assistants find hardest.
- **Check the story.** Let a scene state what should happen ("the battery is
  empty by 23:00", "the hospital is never short") and have `simulate_scene`
  test it, like unit tests for a diagram.
- **The editor.** Drag parts onto the grid, draw links, pick a behaviour, edit
  signals with the expression checked as you type. Saves the same scene
  file the MCP server writes, so a person and an assistant can take turns.
- **Storyboards.** A timeline of events — trip the breaker at 18:00, a storm
  at 14:00 — for talks and lessons. Export as GIF/MP4, from the app and as an
  MCP tool.
- **A hosted MCP endpoint** (streamable HTTP), for assistants that can't run
  a local process.

## Later — deeper physics, real data

- **Effort as well as flow.** Pressure in pipes, voltage on wires,
  temperature in heat loops (the bond-graph view: every domain is effort ×
  flow), so a pipe can be undersized and a feeder can sag.
- **Day totals.** A second sheet that sums the day as a Sankey: where every
  MWh came from and where it ended up.
- **Live inputs.** Bind a signal to real numbers — the GB generation mix and
  carbon intensity, a home inverter's API, a weather feed — and the drawing
  becomes a dashboard that still explains itself.
- **Event chains.** The literal Rube Goldberg: discrete triggers (a float
  lifts a lever, a lever opens a valve) alongside continuous flows.
- **More sheets and parts**, contributed: a hybrid car's drivetrain, district
  heating, a water treatment works, a factory line, a heart and lungs.
