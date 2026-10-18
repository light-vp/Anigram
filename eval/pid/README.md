<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# The P&ID eval

Can a coding assistant draw a P&ID an engineer would accept, and does the
Anigram MCP server make it better at it? Each scenario is a request a client
or a colleague would really send. The same prompt goes to two kinds of
assistant:

- **mcp**: has the Anigram tools and saves `scene.json`, a living P&ID
  (`drawing: "pid"`) that can be simulated.
- **bare**: has no diagram tool and saves `pid.svg` (its drawing) and
  `pid.json` (a list of what is on it, in a fixed neutral shape).

One grader scores both by script, against a hidden answer key. No model
judges anything.

```sh
node eval/pid/grade.mjs <runDir> <scenarioId> [--mode mcp|bare]   # one run, JSON to stdout
node --test eval/pid/grade.test.mjs                               # the grader's own tests
node eval/pid/derive-dexpi.mjs                                    # rebuild the dataset keys
node eval/pid/run.mjs --mode both                                 # the blind runner (see run.mjs)
```

## Results

[RESULTS.md](RESULTS.md) has the 2026-10-17 baseline: two passes of every
scenario on both sides, with time, tokens and cost. In short: the drawings
score about the same (static 96% with Anigram, 94% without), Anigram is
ahead on real DEXPI files and slower and costlier on short written briefs,
and only the Anigram sheets can be checked for behaviour (97%).

## Files

| path                | what it is                                                            |
| ------------------- | --------------------------------------------------------------------- |
| `scenarios.json`    | the prompts, and the input files each run folder gets                 |
| `answers/<id>.json` | the hidden answer key, one per scenario                               |
| `grade.mjs`         | the grader: two adapters, one scoring function; `grade()` is exported |
| `classify.mjs`      | the one family classifier both adapters use                           |
| `derive-dexpi.mjs`  | derives the dataset keys from the DEXPI XML, independently of Anigram |
| `dataset/`          | five DEXPI example P&IDs (CC BY 4.0, unchanged); see its README       |
| `fixtures/`         | hand-made perfect and poor runs of three scenarios, in both modes     |
| `grade.test.mjs`    | proves the grader ranks those fixtures as an engineer would           |
| `run.mjs`           | the blind runner (separate; it only imports `grade`)                  |
| `regrade.mjs`       | re-grades a kept pass with the current grader                         |
| `report.mjs`        | the passes side by side, as Markdown                                  |
| `results/`          | the committed baseline: each pass's JSON and every run's output       |

## Scenarios

31 scenarios: 15 built on real DEXPI P&IDs and 16 written ones. The letters
count the answer key's checks: **E**quipment, **V**alves, **I**nstruments,
**C**onnections, **L**oops and signals, **B**ehaviour claims.

| id                     | source              | what it tests                                                                                     | key                |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| `c01-draw`             | dataset             | C01 reference P&ID from its DEXPI file: two pumps, two exchangers, a tank, PSV, three loops       | E5 V6 I4 C9 L3     |
| `c02-draw`             | dataset             | C02 BASF packed column from its file: 2-of-2 pressure transmitters into a PISZA+ trip             | E1 V1 I3 C1 L2     |
| `i05-draw`             | dataset             | I05 flow ratio control from its file: two FIs into an FFIC, through a converter to the valve      | V1 I4 L4           |
| `c03-draw`             | dataset             | C03 Equinor piping from its file: electrically actuated valve, orifice, ball valve, reducer       | V2 I1 L1           |
| `e06-draw`             | dataset             | E06 pump and plate exchanger joined by one piping system                                          | E2 C1              |
| `i04-draw`             | dataset             | I04 one flow loop: flow element, FIC, actuated globe valve                                        | V1 I2 L1           |
| `i06-draw`             | dataset             | I06 FIC through a control station with a safety override (US) to the valve                        | V1 I3 L3           |
| `i08-draw`             | dataset             | I08 local and CCR pressure indication driving two switching functions                             | I4 L2              |
| `c01-words`            | dataset (described) | C01 described in an engineer's email, no file: graded against the XML's topology                  | E5 V6 I4 C9 L3     |
| `c02-words`            | dataset (described) | C02 in words                                                                                      | E1 V1 I3 C1 L2     |
| `i05-words`            | dataset (described) | I05 in words                                                                                      | V1 I4 L4           |
| `c01-bypass`           | dataset (modified)  | C01 plus block valves and a bypass round PV-4712.02; the original kept                            | E5 V6 I4 C11 L3    |
| `c01-standby`          | dataset (modified)  | C01 plus standby pump P-4712B; **behaviour**: duty trips, standby carries, product never stops    | E7 V6 I4 C11 L3 B3 |
| `c02-trip`             | dataset (modified)  | C02 plus a feed line with XV-2750, LT/LAH and an independent LSHH trip                            | E2 V2 I6 C2 L3     |
| `e06-modify`           | dataset (modified)  | E06 grown into a working sheet: valves, CW side, TT/TIC/TV loop                                   | E3 V3 I2 C4 L1     |
| `transfer-level`       | written             | pumped transfer, LIC on the receiving tank, low-level pump protection                             | E3 V3 I4 C2 L2     |
| `hx-temperature`       | written             | shell-and-tube cooler, TIC on CW, thermal relief                                                  | E2 V3 I2 C3 L1     |
| `dosing-skid`          | written             | duty/standby metering pumps, PSVs back to tank, flow-paced dose; **behaviour**                    | E5 V3 I2 C6 L1 B4  |
| `compressor-antisurge` | written             | scrubber, compressor, after-cooler, anti-surge recycle; **behaviour**: recycle opens overnight    | E4 V3 I3 C6 L1 B2  |
| `boiler-feedwater`     | written             | deaerator, duty/standby BFW pumps, drum level; **behaviour**: trip, drum never dry                | E5 V4 I4 C6 L2 B4  |
| `cooling-water`        | written             | tower, pumps, PHE, tower bypass on TIC; **behaviour**: bypass more at 06:00 than 15:00            | E4 V3 I2 C6 L1 B2  |
| `separator-control`    | written             | separator with LIC, PIC, PSV to flare and LSHH closing the inlet SDV                              | E2 V4 I5 C4 L3     |
| `tank-farm-overfill`   | written             | three tanks, MOV inlets, independent LSHH overfill trips; **behaviour**: switch-over, no overflow | E5 V4 I3 C7 L3 B3  |
| `duplex-filter`        | written             | duplex filters with PDT and PDAH across each                                                      | E3 V1 I5 C4        |
| `reactor-jacket`       | written             | jacketed CSTR: feed FIC, jacket TIC, rupture disc and PSV                                         | E4 V4 I5 C5 L2     |
| `distillation-reflux`  | written             | column, condenser, reflux drum, reboiler, five loops                                              | E7 V5 I9 C11 L5    |
| `ratio-blend`          | written             | additive held at 5% of base stock by FFIC; **behaviour**: the ratio holds every hour              | E5 V1 I3 C4 L1 B2  |
| `prv-station`          | written             | twin PRV streams, strainer, relief; **behaviour**: relief shut, then lifts on PRV failure         | E2 V4 I1 C4 B2     |
| `chemical-injection`   | written             | inhibitor injection: PD pump, relief to tote, double check valves at the quill                    | E4 V3 I2 C3        |
| `lift-station`         | written             | wet well with duty/assist pumps on PLC level control; **behaviour**: storm, no overflow           | E4 V2 I2 C5 L1 B3  |
| `raw-water-standby`    | written             | duty/standby transfer off a tank; **behaviour**: trip at mid-morning, the tank never overflows    | E4 V3 I3 C5 L1 B3  |

Prompts name tags only where a real brief would: a dataset file's own tags,
and the tags a client fixes in a written brief. Behaviour is asked for only
where the client asks for it ("show that…"), which is where a living,
simulated diagram should earn its keep.

## The dataset

The dataset scenarios use eight of the DEXPI e.V. example P&IDs from the
TrainingTestCases repository, <https://gitlab.com/dexpi/TrainingTestCases>,
folder `dexpi 1.3/example pids/`, © DEXPI e.V., licensed **CC BY 4.0** and
used **unchanged** (byte-identical to the originals):

| scenarios                | file in this repo                                    | original under `dexpi 1.3/example pids/`                                                          |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `c01-*`                  | `src/format/fixtures/dexpi-c01-reference.xml`        | `C01 DEXPI Reference P&ID/C01V04-VER.EX01.xml`                                                    |
| `c02-*`                  | `src/format/fixtures/dexpi-c02-column.xml`           | `C02 Process Column (BASF)/C02V03-VER.EX02.xml`                                                   |
| `i05-*`                  | `src/format/fixtures/dexpi-i05-ratio-control.xml`    | `I05 Two flow indications and flow ratio control in CCR/I05V01-VER.EX01.xml`                      |
| `c03-draw`               | `eval/pid/dataset/dexpi-c03-piping.xml`              | `C03 Piping (Equinor)/C03V04-VER.EX02.xml`                                                        |
| `e06-draw`, `e06-modify` | `eval/pid/dataset/dexpi-e06-pump-exchanger.xml`      | `E06 Pump, HeatExchanger, Nozzles Connected With PNS/E06V01-VER.EX01.xml`                         |
| `i04-draw`               | `eval/pid/dataset/dexpi-i04-measurement-control.xml` | `I04 Measurement and Control/I04V01-VER.EX01.xml`                                                 |
| `i06-draw`               | `eval/pid/dataset/dexpi-i06-flow-control.xml`        | `I06 CCR flow indication and high alarm, flow control, control valve/I06V01-VER.EX01.xml`         |
| `i08-draw`               | `eval/pid/dataset/dexpi-i08-pressure-alarms.xml`     | `I08 Local pressure indication, CCR pressure indication, alarms and switches/I08V01-VER.EX01.xml` |

Their answer keys are **derived from the XML** by `derive-dexpi.mjs`, a small
regex XML reader using Node built-ins only. It never calls Anigram's own
importer (`src/format/dexpiImport.ts`), so the ground truth is not Anigram's
reading of the file. The keys are committed; `grade.test.mjs` fails if they
drift from what the script derives. After re-deriving, run prettier over
`answers/`. The modification scenarios (`MODS` in the script) add their
extra requirements on top of the derived key.

## The answer key

```jsonc
{
  "id": "transfer-level",
  "source": "written",
  "equipment":   [{ "family": ["tank", "vessel", "container"], "tag": "^T101$", "says": "tank T-101" }],
  "valves":      [{ "family": "isolation", "min": 2 }, { "family": "control", "tag": "^LV102$" }],
  "instruments": [{ "letters": "LT", "number": "102", "on": { "tag": "^T102$" }, "hops": 2 }],
  "connections": [{ "from": { "tag": "^P101$" }, "to": { "tag": "^T102$" },
                    "via": [{ "family": "check" }, { "family": "isolation", "count": 2 }],
                    "avoid": [{ "tag": "^PV4712\\.02$" }], "through": ["heat-exchanger"] }],
  "forbidden":   [{ "from": …, "to": …, "avoid": [ … ] }],
  "loops":       [{ "controller": [{ "letters": "LIC", "number": "102" }],
                    "final": { "family": "control", "tag": "^LV102$" },
                    "finalOn": …, "sensor": [{ "variable": "L", "min": 1, "on": { "tag": "^T102$" } }] }],
  "signals":     [{ "from": { "letters": "PIZ", "number": "275003A" }, "to": { "letters": "PISZA" } }],
  "behaviour":   [{ "says": "after P-1601A trips, P-1601B takes over", "from": 9, "to": 23, "sometime": true,
                    "all": [{ "of": { "tag": "^P1601A$" }, "field": "out", "op": "==", "value": 0 },
                            { "of": { "tag": "^P1601B$" }, "field": "out", "op": ">", "value": 0 }] }]
}
```

- **Selectors** pick items in the plant graph by any of `tag` (a regex on
  the tag upper-cased with spaces, dashes, underscores and slashes removed:
  `P-101` is `P101`), `family` (one or several; it matches when the item's
  family set meets it), `letters` (ISA-5.1 letters, one or several),
  `variable` (an instrument's first letter) and `number` (its loop number).
  `says` is the readable name used in the report.
- **Families**: equipment `pump`, `compressor`, `fan`, `tank`, `vessel`,
  `drum`, `separator`, `column`, `reactor`, `heat-exchanger`, `boiler`,
  `cooling-tower`, `filter`, `mixer`, `agitator`, `wet-well`, `dampener`,
  `turbine`, `motor` (and the umbrella `container` for tanks and vessels);
  valves `control`, `onoff`, `isolation`, `check`, `relief`, `regulator`,
  `rupture-disc`, `breather`; and `offpage`, `junction`, `strainer`,
  `instrument`.
- **Letters** match ISA-style: same first letter, and every other required
  letter present among the rest (counted, so `LAHH` needs two H). `LIC` is
  met by `LICA`, `FIC` by `FFIC`, but `FFIC` not by `FIC` and `PSV` not by
  `PV`.
- **Counts**: `min` on equipment, valves and instruments.
- **`on`** (instruments, sensors) and **`finalOn`** (loops): the item taps
  into something matching, or sits within `hops` (default 2) process steps of
  it through valves and fittings.
- **Connections** are process paths from `from` to `to` that pass only
  through valves, fittings, strainers and in-line instruments (plus any
  `through` families), meet every `via` (`count` times each, on distinct
  items) and touch no `avoid`. `from` and `to` may be lists of alternatives.
  Direction is not checked: a bare drawing's line direction is not reliable.
- **Loops**: a controller with a signal path (through other instruments) to
  the final element, and the measurements it takes: each `sensor` entry
  needs `min` instruments of that variable on the controller's signal tree
  that tap into the process (a line to something other than the final
  element), optionally `on` an item.
- **Signals**: an instrument-to-instrument signal path (DEXPI's signal lines).
- **Behaviour** claims run on the simulated day (see below). Each claim is
  an AND of conditions `{ of, agg, field, op, value | ref }`: `field` is
  `in`, `out`, `fill`, `demand` or `effort` of the parts `of` picks; `agg` is
  `any` (default), `all`, `sum`, `max` or `min`; `op` is `>`, `>=`, `<`, `<=`,
  `==`, `!=` or `~` (within `tol`, default 5%); `ref` compares with another
  selector's value, optionally at another hour (`ref.at`) and scaled
  (`times`). `at`, or `from` and `to` (inclusive, wrapping past midnight),
  pick the hours; the claim must hold at every one unless `sometime`. Claims
  read tags and families, never Anigram ids, and use fractions and zero
  rather than absolute numbers, so any reasonable model of the plant can
  pass them.

## Scoring

Both adapters build the same graph: items (tag, family set, kind) and
process, signal and measuring connections. One function scores it.

| category      | weight | 0–1 is                                                                                                                               |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `equipment`   | 0.20   | mean over requirements; a right tag on the wrong family, or the family without the tag, is half                                      |
| `valves`      | 0.15   | as equipment                                                                                                                         |
| `instruments` | 0.15   | as equipment; right letters with the wrong number, or not `on` its item, is half                                                     |
| `connections` | 0.20   | 1 per path found; 0.5 if the ends connect but not by that route; forbidden paths count here                                          |
| `loops`       | 0.15   | per loop 0.3 controller + 0.4 final element reached + 0.3 measurements; signals 1 or 0                                               |
| `tags`        | 0.075  | 0.7 × the share of equipment, instruments and actuated/relief valves with an ISA/plant tag + 0.3 × the share of tags that are unique |
| `drawn`       | 0.075  | the share of tagged items whose tag is text on the drawing (whole, or an ISA bubble's letters and number)                            |

`static` is the weighted mean of the categories the key has (a key with no
connections, like I05's, is renormalised over the rest). `delivered` is 1
when the outputs exist and parse (bare: 0.5 for `pid.json`, 0.5 for
`pid.svg`); with nothing to read, everything is 0.

`behaviour` is the share of the key's claims that hold when the scene is
simulated with the repo's own simulator (`src/format/report.ts`,
`simulateDay`, default knobs and switches, the scene's own events). It is
`null` for a scenario with no claims. **A bare run cannot be simulated, so it
scores 0 on behaviour wherever there are claims.** That is the point being
measured, not a penalty on drawing quality: compare `static` for drawing
quality and `behaviour` for "does it do what the client said".

The result also lists, per category, everything that was missing, plus
notes (the scene not being a P&ID, a line naming an item that isn't there).

### How each run becomes a graph

- **mcp**: each part is an item, classified from its DEXPI `class` (the
  symbol it is drawn as), then its `kind`, then its role, refined by its
  `label` where the class is generic (a `Vessel` labelled "packed column" is a
  column; a `ControlValve` tagged `XV-…` or labelled "shutdown" is also on/off;
  a source or sink with no class is an off-page connector, as the P&ID draws
  it). Links in `water`, `heat`, `fuel`, `air` or `oil` are process lines;
  `data` links and `line: signal|data|pneumatic` are signals; power, shafts
  and light are not on a P&ID and are left out, and so is a part that only
  has those. Each instrument is an item; `measures` a part is a measuring
  connection, `measures` another instrument and `drives` are signals.
- **bare**: each item is classified from its free-text `type` with the same
  keyword table (generous with synonyms: "NRV", "non-return valve" and
  "swing check valve" are all `check`), then its label, then its tag
  letters as a last resort. Lines are joined by tag (or label); a `signal`
  line is a signal, anything else a process line.

Nothing Anigram-specific is rewarded: no points for `expect`, `note`,
`titleBlock`, layout, line numbers or check_drawing findings.

### `drawn`

- **bare**: the text in `pid.svg` (every `<text>` and `<tspan>`).
- **mcp**: the sheet as SVG from the built MCP server's `render_scene`
  (`format: "svg"`, labels off), run in the run folder. If the server isn't
  built, the SDK isn't installed or `render_scene` refuses the scene, `drawn`
  is 0 and the missing list says why. A scene whose `drawing` isn't `"pid"`
  scores 0 here.

## The blind runner

The runner (`run.mjs`) is separate from the key. The assistant being scored
runs headless in a fresh temp folder that holds only the scenario's input
files, with Read/Write/Edit confined to that folder (and, in mcp mode, the
Anigram tools), so `answers/` and the grader are out of its reach. It sees
the prompt, and a short note saying what to save:

- mcp: use the anigram tools, make it a P&ID (`drawing: "pid"`), save
  `scene.json`, and put any requested behaviour in the scene's `expect` list.
- bare: save `pid.svg` and `pid.json` in exactly the `{ items: [{ tag, type,
label }], lines: [{ from, to, kind: "process" | "signal" }] }` shape, every
  item tagged.

Nothing in either note says how the run is graded.

## Known limits

- **One measurement per Anigram instrument.** An Anigram instrument
  `measures` one thing, so a controller fed by two transmitters (I05's FFIC,
  C02's PISZA, the anti-surge UIC) can only be wired to one of them, and a
  perfect mcp run of `i05-draw` scores about 0.96, not 1. The fixtures and
  tests record this rather than hide it.
- **A controller drives a gate.** Anigram warns when an instrument `drives` a
  pump (speed or stroke control in `dosing-skid`, `lift-station`,
  `transfer-level`); the grader still credits it.
- **A bare graph is self-declared.** The bare assistant writes `pid.json`
  itself, and the grader takes its lines on trust: it checks that the tags
  are in `pid.svg`, not that the SVG actually draws the pipes `pid.json`
  lists. An Anigram scene is the drawing, so its graph and its sheet cannot
  disagree. Read the bare `static` score as an upper bound.
- **Topology, not geometry.** Nothing checks layout, crossings, symbol
  shapes, line weights or where a bubble sits; `drawn` only checks the tags
  are in the drawing's text. A bare SVG that lists tags in a column passes
  `drawn`.
- **Words, not meaning.** The classifier is a keyword table. A bare `type`
  it doesn't know falls back to the label and tag letters, then `other`;
  unusual vocabulary on either side can cost a match.
- **Undirected paths.** Connections ignore flow direction, so a check valve
  facing the wrong way still counts.
- **Equipment boundaries.** A path may not pass through equipment (a
  strainer is passable, a filter is not), so a run that draws a jacket as a
  separate exchanger, or a mixer as a tee, is met only where the key lists
  that alternative.
- **Behaviour claims are coarse** (fractions, zero, comparisons between
  hours) to survive reasonable modelling choices, and they need the right
  tags on the right parts. They cannot tell a good model from a lucky one.
- **Derived dataset keys** carry the DEXPI files' own quirks: untagged
  actuated valves, PIF numbers such as `031.` (read as `031`), a column
  section that is not drawn separately. Tags score the run's tagging, so a
  faithful redraw of an untagged valve loses a little on `tags`.
