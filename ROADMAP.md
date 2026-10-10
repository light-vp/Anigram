<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Roadmap

The thesis: **a diagram should be the system, running.** Every pixel that
moves is read off a simulation, so the drawing can't lie, and the same sheet
works on a web page, on paper and on a wall.

## Now — the living drawing

- A React-free flow solver: sources, demands, junctions, gates, converters
  (with recipes and losses), stores (surplus-only charging, float switches,
  operator schedules, slow-starting generators) and vents.
- ~40 hand-drawn engineering glyphs that read their motion off state.
- Five sheets: the power grid, a solar house, a town's water, a hydroelectric
  dam, a data centre.
- Live, paper (frozen + labelled, prints and exports SVG), light and dark themes, embed
  and wall-screen views; trace a part to light up where its flow comes from.

## Next — anyone can draw one

- **A scene file format.** JSON with signals as small expressions, so scenes
  no longer need to be TypeScript. The same format is what an editor saves.
- **Describe it, get a drawing.** A scene file is small and regular enough
  for Claude to write from a paragraph ("a narrowboat with a solar panel, a
  leisure battery and a diesel engine that charges it") — then the solver
  checks the story holds up over a day.
- **The editor.** Drag parts from the library onto the grid, draw links,
  pick a behaviour. Orthogonal auto-routing; links snap to busbars.
- **Storyboards.** A timeline of events — trip the breaker at 18:00, a storm
  at 14:00 — for talks and lessons. Export as GIF/MP4.

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
- **More sheets.** A hybrid car's drivetrain, district heating, a water
  treatment works, a factory line, a heart and lungs.
- **A web component.** `<living-diagram scene="grid">` for pages that can't
  use an iframe.
