<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# The scene file

An Anigram drawing is one JSON file. It says **what the parts are, where they
sit and what flows between them** — never how anything animates. A flow
solver runs the network every tick and the sheet draws what it finds: line
width is flow, dot speed is flow, a turbine spins as fast as it generates.
So a scene can't show something its system isn't doing.

The five built-in sheets are scene files too (`list_scenes` / `get_scene` in
the MCP server, or `src/scenes/*.ts`). Read one before writing your own.

## Shape

```jsonc
{
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
  `mechanical`, `data`. Each is drawn differently, and each needs an entry in
  `units` and `scale`.
- `via` are waypoints in grid cells; a link runs through them with rounded
  corners. A straight two-point link that isn't aligned bends `hv`
  (horizontal first, the default) or `vh`.
- `capacity` clips the flow; the sheet flags a link at its limit.
- `loss: true` carries a converter's losses rather than its product.
- Storage that should both charge and discharge needs a link each way.

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
`on('id')` a switch (1 or 0), `prev('id').in|out|fill` another part as it was
last tick. Nothing else — expressions are parsed, never run as code.

## Making a good one

1. Start from the story: what should someone see happen over a day?
2. Lay the parts out left-to-right in the direction things flow; sources on
   the left or top, demand on the right or bottom.
3. Validate, then **simulate a day** and read the table. Captions should say
   what the numbers say. Tune signals until they do.
4. Render it, look at it, fix crossings with `via` waypoints.
