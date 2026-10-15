<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# The scene file

An Anigram drawing is one JSON file. It says **what the parts are, where they
sit and what flows between them** — never how anything animates. A flow
solver runs the network every tick and the sheet draws what it finds: line
width is flow, dot speed is flow, a turbine spins as fast as it generates.
So a scene can't show something its system isn't doing.

The built-in sheets are scene files too (`list_scenes` / `get_scene` in
the MCP server, or `src/scenes/*.ts`). Read one before writing your own.

## Shape

```jsonc
{
  "anigram": 1,                    // the format version this file is written in
  "id": "narrowboat",              // lowercase-and-dashes
  "title": "A narrowboat",
  "subtitle": "Solar, a leisure battery and a diesel that charges it",
  "sheet": "LD-101",               // drawing number in the title block
  "size": [6, 4],                  // grid columns × rows; parts sit on cells
  "units": { "electric": { "rate": "kW", "amount": "kWh" } },
  "scale": { "electric": 2 },      // the flow that draws a link at full width
  "clock": { "start": 6, "rate": 0.6 },  // opening hour; simulated hours per second
  "knobs":    [{ "id": "cloud", "label": "cloud cover", "value": 0.3, "format": "{pct}%" }],
  "switches": [{ "id": "engine", "label": "engine running", "on": false }],
  "parts": [ … ],
  "links": [ … ],
  "captions": [{ "from": 6, "to": 10, "text": "Morning: the panels wake up…" }]
}
```

Only `id`, `title`, `size`, `parts` and `links` are required. `subtitle`
defaults to empty, `sheet` to `LD-100`, `clock` to `{ start: 6, rate: 1 }`.

`anigram` is the format version, currently `1`. Write it in every new file.
A file without it is read as version 1, and a file from an older version is
upgraded when it loads, so scene files and share links keep working as the
format grows. A file from a newer version than the reader knows is refused
with a message saying so.

The format is also a JSON Schema,
[`schema/scene.v1.json`](../schema/scene.v1.json). Point a file's `$schema`
at its raw URL and editors such as VS Code check and autocomplete it as you
type:

```json
{
  "$schema": "https://raw.githubusercontent.com/light-vp/Anigram/main/schema/scene.v1.json",
  "anigram": 1
}
```

## Parts

```json
{
  "id": "battery",
  "kind": "battery",
  "label": "Leisure battery",
  "at": [3, 2],
  "labelSide": "right",
  "note": "Fills from spare sun; the fridge runs off it overnight.",
  "behaviour": {
    "role": "storage",
    "capacity": 5,
    "start": 0.6,
    "maxIn": 1.5,
    "maxOut": 2
  }
}
```

- `kind` picks the drawing (see the parts list below). It does not change the
  physics — `behaviour` does.
- `at` is `[column, row]`, zero-based, inside `size`. Fractions are allowed
  for nudging. Give each part its own cell; keep one cell of air between
  busy rows so labels fit.
- `labelSide` is `below` (default), `above`, `left` or `right`.
- `toggles` names a switch; clicking the part on the sheet flips it.

## Behaviours

Every part has one role. Numbers that can change over the day are
**signals** (next section).

| role        | fields                                                                                   | what it does                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`    | `output` signal, `dispatchable?`, `merit?`                                               | produces up to `output`. A `dispatchable` one (gas, diesel) only runs to cover a shortfall.                                                                |
| `sink`      | `demand` signal, `priority?`, `absorbsSurplus?`                                          | consumes up to `demand`. Higher `priority` is served first. `absorbsSurplus` (export, a spillway) only takes what nobody else wanted.                      |
| `bus`       | —                                                                                        | a junction (busbar, manifold). Pulls from its cheapest input first: renewables, then stores, then fuel.                                                    |
| `gate`      | `capacity`, `open?` signal 0..1                                                          | passes at most `capacity × open` — a breaker, a valve.                                                                                                     |
| `converter` | `output` domain, `recipe`, `capacity?`, `startup?` hours                                 | turns inputs into output. `recipe` is what one unit of output takes: a 40% gas plant is `{ "fuel": 2.5 }`. Energy in minus out leaves along a `loss` link. |
| `storage`   | `capacity`, `start?` 0..1, `maxIn`, `maxOut` signals, `efficiency?`, `merit?`, `refill?` | stores flow. Charges from surplus only, unless `refill: { below, until }` makes it a float switch that refills itself.                                     |
| `vent`      | —                                                                                        | where losses and spills go: the sky, a river, a cooling tower.                                                                                             |

## Links

```json
{ "from": "pv", "to": "board", "domain": "electric", "via": [[2, 1]] }
```

- `domain` is one of `light`, `electric`, `water`, `heat`, `fuel`,
  `mechanical`, `data`, `oil` (hydraulic oil) and `air` (compressed air).
  Each is drawn differently, and each needs an entry in `units` and `scale`.
- `via` are waypoints in grid cells; a link runs through them with rounded
  corners. A straight two-point link that isn't aligned bends `hv`
  (horizontal first, the default) or `vh`.
- `capacity` clips the flow; the sheet flags a link at its limit.
- `loss: true` carries a converter's losses rather than its product.
- Storage that should both charge and discharge needs a link each way.
- `drop` is the effort the link loses when it carries its `capacity` (see
  the next section).

## Effort: pressure, voltage, temperature

Flow says how much moves. Effort says how hard it is pushed: pressure behind
water, oil, air and fuel (bar), voltage behind current (V), temperature
behind heat (°C). Once a tick's flows are solved, effort is read along them,
so a sheet can show a long cable leaving the last house on a low voltage, a
throttled valve's pressure drop, or a pump building the pressure that lifts
a relief valve.

A part's `effort` says what it does to the effort it is given:

```json
{ "id": "grid", "behaviour": { "role": "source", "output": 100 }, "effort": { "set": 240 } }
{ "id": "pump", "behaviour": { "role": "converter", "output": "water", "recipe": { "electric": 0.4, "water": 1 }, "capacity": 12 },
  "effort": { "boost": "4 - 1.5 * pow(part('pump').out / 12, 2)" } }
{ "id": "tx", "behaviour": { "role": "converter", "output": "electric", "recipe": { "electric": 1.02 } }, "effort": { "ratio": 0.0364 } }
{ "id": "tower", "behaviour": { "role": "storage", … }, "effort": { "set": "2.5 + 0.6 * part('tower').fill" } }
{ "id": "house", "behaviour": { "role": "sink", "demand": 4 }, "effort": { "min": 216, "max": 253 } }
```

| field        | who has it                       | what it does                                                                                                                                 |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `set`        | source, storage, converter, gate | holds its outlet at this: a supply's voltage, a tank's head, a boiler's flow temperature. On a gate it caps, like a pressure-reducing valve. |
| `boost`      | converter                        | adds this to what arrives: a pump's head, a compressor's rise                                                                                |
| `ratio`      | converter                        | multiplies what arrives: a transformer's turns ratio                                                                                         |
| `drop`       | gate, converter (with capacity)  | lost through the part at its full capacity: a filter, a valve wide open. A throttled gate loses more.                                        |
| `min`, `max` | any                              | the range it is rated for; outside it the sheet raises an alarm and `simulate_scene` lists it                                                |

- `set` and `boost` are signals read after the flows are in, so they can
  read parts as they are now with `part('id')`: a pump's head falling as it
  delivers more is `boost: "4 - 1.5 * pow(part('pump').out / 12, 2)"`.
- A supply or store holds its effort only while it has something to give: a
  panel at night or an empty tank reads 0.
- A link's `drop` grows with its flow: as the square of it in a pipe, in
  proportion in a cable or a heat main. Where lines meet, efforts mix by how
  much each line brings; where nothing flows, the highest effort stands.
- `units[domain].effort` names the unit; it defaults to bar, V or °C.
- `prev('id').effort` and `part('id').effort` read a part's effort at its
  outlet. A P&ID's pressure (P), temperature (T) and voltage (E) instruments
  read it when they're given no `reads`.

A **relief valve** is a gate that opens on the pressure behind it rather
than a signal: it starts to lift at `at` and is wide open at `full` (10%
over `at` when left out). Each tick it settles where the pressure it lets
off holds it, so put a sink downstream (a drain back to the tank) that asks
for at least its capacity:

```json
{
  "id": "relief",
  "kind": "valve",
  "behaviour": {
    "role": "gate",
    "capacity": 40,
    "relief": { "at": 150, "full": 180 }
  }
}
```

## Events: cause and effect

`events` make a chain: each one watches a condition, and when it turns true
it waits its `after` hours, then flips a switch or sets a knob. The next
event can wait on that one with `fired('id')`. Every link is a real
condition on the simulated flows, so a cloudy day makes the whole machine
run late.

```json
"events": [
  { "id": "dawn", "says": "Sunlight on the panel starts the pump.",
    "when": "part('pv').out > 0.6", "then": [{ "switch": "pump", "on": true }], "at": "pv" },
  { "id": "full", "says": "The tank fills, and its float stops the pump.",
    "when": "part('tank').fill > 0.95", "then": [{ "switch": "pump", "on": false }], "at": "tank" },
  { "id": "timer", "says": "Half an hour later, the timer opens the sprinkler.",
    "when": "fired('full')", "after": 0.5, "then": [{ "switch": "sprinkler", "on": true }], "at": "valve" }
]
```

- `when` reads parts as they are now with `part('id')`, plus everything a
  signal can. It fires each time it turns true, then re-arms once it is
  false again; `once: true` fires it at most once a run. It counts as true
  at the opening hour if it already is.
- `then` is a list of `{ "switch": "id", "on": true }` and
  `{ "knob": "id", "value": 0.5 }`. What an event sets takes over that
  control until someone moves it by hand.
- `fired('id')` is 1 in the tick after an event fires; `since('id')` is the
  hours since it last fired (very large before it has). Both work in any
  expression: a sink's demand can be `since('bell') < 1 ? 5 : 0`.
- `at` is the part it happens at. The sheet rings that part as the event
  fires, shows its `says` as the caption, and draws the chain: a dashed arrow
  to each event that waits on it, and a brief one to every part whose switch
  it flips.
- `simulate_scene` lists the hours each event fired, and `expect` checks can
  read `fired()` (fired within the hour before) and `since()`.

## Engineering drawings

The same scene can be drawn the way an engineer would draw it. Set
`drawing` and the sheet swaps the pictures for standard symbols, draws each
line by what it carries, and leaves out what the practice doesn't show. The
simulation still runs underneath: arrows fill in while something flows,
valves and breakers show their state, tank levels move.

| `drawing`     | draws                                                        | shows                   |
| ------------- | ------------------------------------------------------------ | ----------------------- |
| `pictorial`   | the illustrated sheet (the default)                          | everything              |
| `pid`         | a P&ID: ISO 10628-2 symbols, ISA-5.1 tags and lines          | water, heat, fuel, data |
| `single-line` | IEC 60617 symbols, or ANSI/IEEE 315 with `"symbols": "ansi"` | electric                |
| `pfd`         | a process flow diagram: major equipment and streams          | water, heat, fuel       |
| `fluid-power` | a hydraulic or pneumatic circuit: ISO 1219-1 and 1219-2      | oil, air, mechanical    |

A part none of whose links the practice shows is left off the sheet, so a
P&ID of a pumping station has no power cables and a single-line has no
pipes.

```jsonc
{
  "drawing": "pid",
  "titleBlock": {
    "owner": "Severn Water", "project": "Hill reservoir",
    "drawnBy": "VP", "checkedBy": "AK", "approvedBy": "",
    "issued": "2026-10-11", "revision": "B", "status": "for construction"
  },
  "parts": [
    { "id": "p1", "kind": "pump", "tag": "P-101", "class": "CentrifugalPump", … }
  ],
  "links": [
    { "from": "p1", "to": "t1", "domain": "water", "tag": "100-W-001", "line": "process" }
  ]
}
```

- `tag` on a part is its equipment tag (`P-101`, `=G1`); tags are unique on
  a sheet. On a link it is the line number, drawn along the line.
- `class` is the symbol a part is drawn as. The guide lists each practice's
  classes; P&ID classes carry DEXPI's names. Without one, the part's `kind`
  picks a class (a `pump` is a `CentrifugalPump` on a P&ID, a `Motor` on a
  single-line) and then its role does (a source is an off-page connector on a
  P&ID, a generator on a single-line). A part with no class at all draws as a
  labelled box, with a warning.
- `line` is what a link is drawn as: `process` (solid, heavy), `utility`
  (solid, light), `signal` (dashed), `pneumatic` (slashed) or `data` (dotted).
  It defaults to `signal` for data and `process` otherwise.
- `titleBlock` fills the drawing's ISO 7200 title block, which every
  engineering sheet carries in the bottom right of its border: owner,
  document type (from `drawing`) and status along the top, `title` and
  `subtitle` in the middle (with `project` above them), and drawn, checked,
  approved, issued, revision and `sheet` along the bottom. Fields left out
  stay as empty boxes. `issued` is a date like `2026-10-11`.
- On a fluid-power circuit, a cylinder is a `storage` whose fill is its
  stroke (the piston follows it), and a directional valve is a `gate` whose
  `open` picks the envelope: shut is the centre, `1` the straight-through
  envelope, anything between the crossed one. Lines from above or below
  land on the valve's own A, B, P and T ports. Tags run circuit, letter,
  number after ISO 1219-2 (`0P1`, `1V1`, `1A1`), and a shaft draws as a
  double line. [`examples/hydraulic-press.json`](../examples/hydraulic-press.json)
  is a whole press circuit.
- On a single-line, a busbar stretches to reach every feeder, and a feeder
  on another row drops straight from the bar above it rather than from its
  centre.
- The MCP server's `new_scene` returns a small, working sheet for each
  practice, already tagged and titled, to edit rather than start blank.
- The MCP server's `check_drawing` marks the sheet up the way a reviewing
  engineer would: equipment tagged in the practice's scheme (ISA letters on a
  P&ID, IEC 81346 on a single-line, ISO 1219-2 on a fluid-power circuit),
  lines and streams numbered, control valves driven by a controller and
  loops sharing a number, loads and generators behind a breaker, oil coming
  back to a reservoir behind a relief valve, exhaust air through a silencer,
  the title block filled. It advises; with
  `strict` any finding fails it, for CI and print-ready sheets.
- `lint_layout` checks the sheet reads cleanly (no crossing or doubled
  lines, no line through a part, no slanted runs, no label on top of
  another or off the edge of the sheet), and `auto_layout` lays a sheet out by its flow: a single-line
  top to bottom with feeders dropping off the busbars, a fluid-power circuit
  bottom to top (tank and pump under the valves, actuators on top), anything
  else left to right with P&ID instruments a row above what they serve.
- `export_dexpi` writes a P&ID as DEXPI 1.3 (Proteus 4.1.1) XML for plant
  design software. It carries the plant rather than the picture: equipment
  with tags and nozzles, each numbered line as a piping system with its
  valves in place, off-page connectors, and instrument loops through to the
  actuated valve. The P&ID classes map to DEXPI's (a `ControlValve` goes
  across as a `GlobeValve` with an actuating system).
- `import_dexpi` goes the other way: a DEXPI 1.3 P&ID from plant design
  software opens as a living P&ID. Equipment keeps its tags, each piping
  segment becomes lines from nozzle to nozzle with its valves in place
  (flanges and reducers passed through), and instrument loops keep the
  valves they drive. The file says nothing about behaviour, so each class
  gets the usual one (a pump that can be stopped, a hand valve that can be
  shut, a control valve on a slider, a tank that stores) and the notes say
  so; set real duties and add an `expect` list before trusting a number.
- `import_sfiles` and `export_sfiles` read and write SFILES 2.0, the line
  notation for flowsheets: `(raw)(pp)(hex)(r)[(prod)](dist)(prod)`. A string
  opens as a PFD laid out by its flow, with major equipment tagged; a scene's
  process streams write back as a string, recycles and all.
- The app's editor (`?build=1`) edits the scene file itself, so saving it
  back changes only what the person changed. `share_link` with
  `view: "editor"` opens a file there.
- `render_scene` with a `.pdf` path prints the sheet on one landscape page
  of A3 (or `paper`: `A4`, `A2`, `A1`), for filing or printing.

### Instruments

A P&ID shows its instruments as ISA-5.1 bubbles. Each sits on its own cell,
joined by a thin line to what it measures and, for a controller, by a signal
line to the valve it drives. Its reading is shown live beside it, in red
outside its `low` and `high`.

```json
"instruments": [
  { "tag": "LT-101", "at": [5, 0], "measures": "tank", "low": 25, "high": 95 },
  { "tag": "LIC-101", "at": [7, 0], "measures": "LT-101", "drives": "lv", "mounting": "dcs" },
  { "tag": "FI-102", "at": [8, 3], "measures": "lv", "mounting": "panel" }
]
```

- `tag` is ISA-5.1: the first letter is what is measured (`L`evel,
  `F`low, `P`ressure, `T`emperature, `J` power, `A`nalysis…), the next
  letters what the instrument does (`T`ransmit, `I`ndicate, `C`ontrol,
  `A`larm, `R`ecord…), then the loop number. The guide lists every letter.
- `measures` is a part, or another instrument whose signal it takes: the
  controller above reads the transmitter, which reads the tank.
- `reads` is what it shows, as an expression of parts as they are now:
  `"part('pump').in * 0.25"`. A level instrument shows its tank's fill in
  percent and a flow instrument its part's flow when `reads` is left out;
  anything else shows only its tag unless given one. `unit` follows the
  reading.
- `drives` is the final element a controller works, usually a gate. The
  instrument only draws the loop: the gate's own `open` signal does the
  controlling, as in `"clamp((prev('tank').fill - 0.2) / 0.3, 0, 1)"`.
- `signal` is how that signal travels: `signal` (electric, dashed, the
  default), `pneumatic` or `data`.
- `mounting` is where it is: `field` (a plain bubble, the default),
  `panel` (a line across it), `behind-panel` (a dashed line), `dcs` (in a
  square) or `plc` (a diamond in a square).

[`examples/feed-tank-pid.json`](../examples/feed-tank-pid.json) is a whole
P&ID with a level control loop.

## Signals

A signal is a number or an expression string:

```
"32 * sun(hour) * (1 - 0.85 * knob('cloud'))"
"on('mains') ? 1 : 0"
"between(hour, 16.5, 21.5) ? 360 : 0"
"0.35 * prev('servers').in"
```

Arithmetic, comparisons, `&&` `||` `!`, `? :`, numbers, `hour` (0–24),
`day`, `pi`, and the functions listed below. `knob('id')` reads a slider,
`on('id')` a switch (1 or 0), `prev('id').in|out|fill|effort` another part as
it was last tick, `fired('id')` and `since('id')` an event. Nothing else —
expressions are parsed, never run as code.

## Stories: `expect`

A sheet makes claims ("the battery runs flat overnight, then the grid takes
over"). Write each one as a check on the simulated day, and `check_scene`
tells you whether the scene really does what it says:

```json
"expect": [
  {
    "says": "by early afternoon the panels have filled the battery",
    "check": "part('battery').fill > 0.95",
    "at": 13
  },
  {
    "says": "overnight the battery runs dry and the grid takes over",
    "check": "part('battery').fill < 0.05 && part('grid').out > 0",
    "at": 2
  },
  {
    "says": "the house is never short",
    "check": "part('house').in >= 0.999 * part('house').demand"
  }
]
```

- `says` is the claim in words; `check` is a signal expression that is true
  when it holds. `part('id').in|out|fill|demand|effort` reads a part as it is at
  that hour (`demand` is what a sink asked for). `knob()` and `on()` read the
  controls the day was run with.
- Checks run on the whole hours of the day. `at` picks one hour; `from` and
  `to` a window, inclusive, wrapping past midnight; neither means every hour.
- A check must hold at every hour it covers, unless `sometime: true`, when
  one hour is enough.
- Compare with a little room (`>= 0.999 * demand`, `fill > 0.95`): the
  numbers are rounded to three decimals.

## Real numbers

A sheet can validate, run, and pass its own `expect` list while describing a
machine that couldn't exist, because the same author wrote the numbers and the
claims. The validator warns when a scene breaks the physics, with the fix:

- **A machine runs on something.** A pump, heat pump, generator or other
  conversion part is a `converter` whose `recipe` names what drives it. Made
  a `source`, it makes its output from nothing, and whatever is linked into it
  is ignored.
- **Nothing is over 100% efficient.** With every energy domain in the same
  unit, a converter's energy inputs add up to at least 1 per unit of output:
  a 40% generator is `{ "fuel": 2.5 }`, a motor about `{ "electric": 1.1 }`.
  A heat pump with a COP of 3.3 takes `{ "electric": 0.3, "heat": 0.7 }`, the
  heat coming from an `air` source.
- **A round trip comes back smaller.** Electricity made into hydrogen and back
  returns about 0.35 of itself, a battery about 0.9. Units cancel around a
  loop, so this is checked even when fuel is in t/h and power in MW.
- **Junctions, valves and stores keep their domain.** Changing fuel into
  electricity takes a converter.
- **Every link is used.** A sink passes nothing on; a converter only draws
  the domains in its recipe.

Typical figures: gas or diesel set 35–42% (`fuel` 2.4–2.9), fuel cell 50%
(`fuel` 2), PV 20% of the light that falls on it (`light` 5), wind or water
turbine 90% of the shaft power (`mechanical` 1.1), electrolyser 70%
(`electric` 1.4 per unit of hydrogen energy), gas boiler 90% (`fuel` 1.1).

## Making a good one

1. Start from the story: what should someone see happen over a day? Write it
   down as the `expect` list first.
2. Lay the parts out left-to-right in the direction things flow; sources on
   the left or top, demand on the right or bottom.
3. Validate. A field the format doesn't have is ignored with a warning, and
   a name that is nearly right (a kind, a role, a domain, a knob or part id)
   comes back with the one it probably meant.
4. **Check it.** `check_scene` runs the day and reports every expectation;
   when one fails it says at which hours and what the parts were doing.
   `simulate_scene` has the hour-by-hour table. Tune signals until every
   line holds, and make the captions say what the numbers say. Clear the
   physics warnings too: a story that only holds because a machine is 200%
   efficient isn't one.
5. Render it, look at the picture, fix crossings with `via` waypoints.
