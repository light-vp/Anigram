// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { MCP_INSTALL, NPM_URL, REPO_URL, SUPPORT_URL } from './links.ts'

/*
 * The docs page, as data: sections of paragraphs, lists, code and tables.
 * Inline `code` and [links](url) are written as in Markdown. Kept short on
 * purpose: each section says how a thing works and links to the full
 * reference in the repo, which is generated from the code.
 *
 * MCP_TOOLS must name every tool the server registers; `npm run docs:check`
 * fails when they drift apart.
 */

export type Block =
  | { p: string }
  | { h: string }
  | { list: string[] }
  | { steps: string[] }
  | { code: string }
  | { table: { head: string[]; rows: string[][] } }

export interface Section {
  id: string
  title: string
  blocks: Block[]
}

const BLOB = `${REPO_URL}/blob/main`

/** every MCP tool, in the order an assistant usually reaches for them */
export const MCP_TOOLS: Array<[string, string]> = [
  [
    'anigram_guide',
    'the scene format, every drawable part, the signal functions. Read first.',
  ],
  ['list_scenes', 'the built-in sheets'],
  ['get_scene', 'a built-in sheet as JSON, the best example to copy'],
  [
    'new_scene',
    'a working starter for a P&ID, single-line, PFD, fluid-power or pictorial sheet, with that practice’s rules',
  ],
  [
    'validate_scene',
    'errors (won’t load) and warnings (will run, probably not what you meant)',
  ],
  ['write_scene', 'validate and save a scene file'],
  ['edit_scene', 'add, move, update or remove parts and links in place'],
  ['simulate_scene', 'a day, hour by hour, with every alert and shortfall'],
  ['check_scene', 'valid, and every claim in its `expect` list holds'],
  [
    'check_drawing',
    'what an engineer would mark up: tags, line numbers, loops, breakers, title block',
  ],
  ['lint_layout', 'crossing lines, clashing labels, a line through a part'],
  ['auto_layout', 'lay the sheet out by its flow'],
  [
    'render_scene',
    'the sheet at any hour: a PNG to look at, an SVG, or a PDF to print',
  ],
  [
    'render_storyboard',
    'the moments that tell the day as a page of panels, or the day itself as a GIF or MP4',
  ],
  ['share_link', 'a URL that opens it live, or in the editor'],
  [
    'export_dexpi',
    'a P&ID as DEXPI 1.3 Proteus XML, for plant design software',
  ],
  [
    'import_dexpi',
    'a DEXPI P&ID from plant design software, as a living sheet',
  ],
  ['import_sfiles', 'an SFILES 2.0 flowsheet string, as a living PFD'],
  ['export_sfiles', 'a sheet’s process streams as an SFILES 2.0 string'],
]

export const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: 'Overview',
    blocks: [
      {
        p: 'Anigram draws engineering diagrams that run. Every wire, pipe and shaft on the sheet carries what a live simulation says it carries, at the speed it carries it: line thickness is flow, the dots move at its speed, a turbine spins as fast as it is generating. Trip a breaker and the city goes dark while the hospital’s diesel catches it. Nothing is animated by hand.',
      },
      {
        p: 'A drawing is one small JSON file, the scene. The editor on this site, the MCP server your coding assistant uses, and every export read and write that same file, so a person and an assistant can take turns on one drawing.',
      },
      {
        list: [
          '**Editor**: draw a sheet by hand, or open one an assistant wrote. It is the home page.',
          '**Examples**: five finished sheets (a power grid, a solar house, a town’s water, a dam, a data centre) with their dials.',
          '**MCP server**: ask Claude, Cursor or any MCP client for a drawing in a sentence.',
          `**Open source**: MIT licensed, on [GitHub](${REPO_URL}).`,
        ],
      },
    ],
  },
  {
    id: 'editor',
    title: 'Using the editor',
    blocks: [
      {
        steps: [
          'Pick a part on the left, then click an empty square to place it.',
          'Drag one part onto another to connect them; drag a part to an empty square to move it.',
          'Click a part to size it, tag it, or write its signals: numbers, or expressions over the time of day and the dials.',
          'Save the file, copy a link that opens it here, or copy a view link that shows it running.',
        ],
      },
      {
        p: '**start from** begins a new sheet from a starter: a pictorial sheet, a P&ID, a single-line diagram, a process flow diagram or a hydraulic circuit. On an engineering drawing the palette offers that practice’s symbols, tagged as they land (a pump arrives as `P-102`).',
      },
      {
        p: 'The checks beside the sheet are the ones the MCP server runs: whether it runs, whether its story holds, what a reviewing engineer would mark up, and whether the layout reads cleanly. Your sheet is kept in this browser between visits. Drop a scene file anywhere on the page to open it.',
      },
    ],
  },
  {
    id: 'mcp',
    title: 'MCP server',
    blocks: [
      {
        p: `The MCP server lets a coding assistant write a living diagram from a paragraph, run it through a day to check the story holds, look at it, and hand you a link. It is [anigram-mcp on npm](${NPM_URL}) and runs anywhere Node 20 does.`,
      },
      { h: 'Install' },
      { p: 'Claude Code:' },
      { code: MCP_INSTALL },
      {
        p: 'Claude Desktop, Cursor and other clients, in the `mcpServers` section of their config:',
      },
      {
        code: `{
  "mcpServers": {
    "anigram": { "command": "npx", "args": ["-y", "anigram-mcp"] }
  }
}`,
      },
      { h: 'Ask for a drawing' },
      {
        p: '“Draw a narrowboat with solar panels on the roof, a leisure battery and the engine’s alternator as backup. Check the battery runs flat overnight and the engine takes over, then give me a link.” The assistant reads the guide, writes the file, simulates a day, fixes the numbers until the story holds, and shares the link, which opens here.',
      },
      {
        p: 'For an engineering drawing, the prompts `draw-pid`, `draw-single-line`, `draw-pfd`, `draw-fluid-power` and `draw-sheet` hand the assistant that practice’s conventions and the way to work.',
      },
      { h: 'Tools' },
      {
        table: {
          head: ['tool', 'what it does'],
          rows: MCP_TOOLS.map(([name, what]) => [`\`${name}\``, what]),
        },
      },
      { h: 'Settings' },
      {
        list: [
          'Paths are relative to the folder the client starts the server in and must stay inside it. `ANIGRAM_ALLOW_PATHS` adds more folders, separated like `PATH`.',
          '`ANIGRAM_APP_URL` points `share_link` at another copy of this app, such as `http://localhost:5173/` while you run it locally.',
        ],
      },
      {
        p: `Every tool, with a real call and its answer: [the MCP reference](${BLOB}/docs/reference/mcp-tools.md).`,
      },
    ],
  },
  {
    id: 'scene',
    title: 'Scene files',
    blocks: [
      {
        p: 'A scene is plain JSON: parts on a grid and the links between them. Each part has a kind (the picture) and a behaviour (what it does); each link carries one domain: light, electricity, water, heat, fuel, shaft power or data.',
      },
      {
        code: `{
  "anigram": 1,
  "id": "pump-and-tank",
  "title": "A pump and a tank",
  "subtitle": "Fills by day, drains by night",
  "sheet": "LD-100",
  "size": [5, 2],
  "units": { "water": { "rate": "m³/h", "amount": "m³" } },
  "scale": { "water": 10 },
  "parts": [
    { "id": "well", "kind": "well", "label": "Borehole", "at": [0, 0],
      "behaviour": { "role": "source", "output": 8 } },
    { "id": "pump", "kind": "pump", "label": "Pump", "at": [1, 0],
      "behaviour": { "role": "gate", "capacity": 8 } },
    { "id": "tank", "kind": "watertower", "label": "Tank", "at": [2, 0],
      "behaviour": { "role": "storage", "capacity": 40, "maxIn": 8, "maxOut": 8,
                     "refill": { "below": 0.3, "until": 0.9 } } },
    { "id": "town", "kind": "house", "label": "Town", "at": [4, 0],
      "behaviour": { "role": "sink", "demand": "6 * water(hour)" } }
  ],
  "links": [
    { "from": "well", "to": "pump", "domain": "water" },
    { "from": "pump", "to": "tank", "domain": "water" },
    { "from": "tank", "to": "town", "domain": "water" }
  ],
  "expect": [
    { "says": "the town never runs short", "check": "part('town').in >= part('town').demand" }
  ],
  "clock": { "start": 6, "rate": 1 }
}`,
      },
      {
        p: "Anything that changes over the day is a **signal**: a number, or a small expression the solver evaluates (it never runs as code), like `32 * sun(hour) * (1 - 0.85 * knob('cloud'))`. An `expect` list states the sheet’s story as checks on the simulated day, and the editor and the MCP server hold the sheet to it.",
      },
      {
        p: `The whole format: [scene-format.md](${BLOB}/docs/scene-format.md), with a [JSON schema](${BLOB}/schema/scene.v1.json) and a reference of [every part](${BLOB}/docs/reference/parts.md).`,
      },
    ],
  },
  {
    id: 'simulation',
    title: 'How the simulation works',
    blocks: [
      {
        p: 'Every tick the solver resolves the whole network as a **pull**. Each demand asks upstream for what it wants. A busbar asks its cheapest input first: renewables, then storage, then anything that burns fuel. A converter asks for its recipe (a 45%-efficient gas plant takes 2.2 units of fuel per unit of electricity) and sends what it loses down a loss line. A gate never passes more than it is open.',
      },
      {
        p: 'Stores then charge from surplus only, so a battery fills from sun nobody used, never by burning gas, and whatever is still unclaimed goes to export or over the spillway. When there isn’t enough to go round, consumers of equal priority share the shortfall fairly; a higher priority (a hospital) is served first.',
      },
      {
        table: {
          head: ['role', 'what it is'],
          rows: [
            [
              '`source`',
              'produces up to its output; a dispatchable one only burns fuel to cover a shortfall',
            ],
            ['`sink`', 'consumes up to its demand, by priority'],
            ['`bus`', 'a junction: a busbar, a manifold'],
            [
              '`gate`',
              'passes flow up to its capacity times how open it is: a valve, a breaker, a pump',
            ],
            [
              '`converter`',
              'turns inputs into an output by a recipe, losses down a loss link',
            ],
            ['`storage`', 'a battery, a tank, a reservoir'],
            ['`vent`', 'where losses and spills go: the sky, a river'],
          ],
        },
      },
      {
        p: 'The sheet re-renders from that state on one animation clock. The solver is React-free and runs the same in node, which is how the MCP server and the tests run a whole day headless. A 300-part sheet solves in about 0.3 ms a tick.',
      },
    ],
  },
  {
    id: 'effort',
    title: 'Pressure, voltage and temperature',
    blocks: [
      {
        p: 'Flow says how much moves; **effort** says how hard it is pushed: pressure behind water, oil, air and fuel, voltage behind current, temperature behind heat. Once a tick’s flows are solved, effort is read along them. A supply or a tank sets it, a pump adds its head, a transformer multiplies by its ratio, and every link and part with a `drop` loses some on the way, more the harder it works.',
      },
      {
        code: `{ "id": "grid",  "effort": { "set": 240 } }
{ "id": "pump",  "effort": { "boost": "4 - 1.5 * pow(part('pump').out / 12, 2)" } }
{ "id": "house", "effort": { "min": 216 } }
{ "from": "pole1", "to": "pole2", "domain": "electric", "capacity": 30, "drop": 8 }`,
      },
      {
        list: [
          'A link’s `drop` is what it loses at its capacity: as the square of the flow in a pipe, in proportion in a cable.',
          'A part’s `min` and `max` are its rating. Outside them the reading turns red and `simulate_scene` lists an alert.',
          'A relief valve is a gate with `relief: { at, full }`: it lifts on the pressure behind it, settling where the flow it lets off holds it.',
          'A P&ID’s pressure, temperature and voltage instruments read it with no extra setup.',
        ],
      },
      {
        p: 'The water tower sheet carries pressure: open the hydrant at breakfast and watch the taps.',
      },
    ],
  },
  {
    id: 'events',
    title: 'Event chains',
    blocks: [
      {
        p: "An event watches a condition on the running sheet. When it turns true, the event waits its `after`, then flips a switch or sets a knob, and the next event can wait on that one with `fired('id')`. Chain them and you have a Rube Goldberg machine where every step is something the simulation really did.",
      },
      {
        code: `"events": [
  { "id": "full", "says": "The tank fills, and its float stops the pump.",
    "when": "part('tank').fill > 0.95", "then": [{ "switch": "pump", "on": false }], "at": "tank" },
  { "id": "timer", "says": "Half an hour later, the timer opens the sprinkler.",
    "when": "fired('full')", "after": 0.5, "then": [{ "switch": "sprinkler", "on": true }], "at": "valve" }
]`,
      },
      {
        p: "As an event fires, its part rings, its words become the caption, and an arrow reaches out to whatever it switched. A dashed arrow joins each event to the next one in the chain. `since('id')` reads the hours since an event fired, in any expression. See it in [the garden that waters itself](./?scene=garden-machine).",
      },
    ],
  },
  {
    id: 'storyboards',
    title: 'Storyboards and video',
    blocks: [
      {
        p: 'A storyboard is the handful of moments that tell a sheet’s day, picked from what the simulation really did: the first time each event fires, so a chain that loops is told once, and the scene’s captions where nothing fires. Each panel is the drawing at that moment, with its time and what happened.',
      },
      {
        p: 'The same moments pace a recording. The clock stops for two seconds at each one, with what happened written under the sheet while the flows keep moving, then glides on to the next, so a GIF of a Rube Goldberg machine pauses on every link of it.',
      },
      {
        list: [
          'In the app: **▤ storyboard** on any sheet, or **storyboard** in the editor. It runs with the knobs and switches as you set them, and saves a GIF, an MP4 (where the browser can encode H.264), or the board as an SVG. Nothing is uploaded.',
          'From an assistant: `render_storyboard` returns the board as a PNG to look at, or saves it as SVG or PDF; `out: "day.gif"` or `"day.mp4"` records the day (MP4 needs ffmpeg on the PATH). `at` picks the hours yourself; `from` and `to` narrow the stretch; `seconds`, `fps` and `hold` shape the recording.',
        ],
      },
    ],
  },
  {
    id: 'drawings',
    title: 'Engineering drawings',
    blocks: [
      {
        p: 'One scene can be drawn several ways. Set `drawing` on the scene, or pick it in the editor’s sheet panel.',
      },
      {
        table: {
          head: ['drawing', 'follows'],
          rows: [
            [
              'pictorial',
              'Anigram’s own picture style: a glyph for every kind of part',
            ],
            [
              'P&ID (`pid`)',
              'ISO 10628-2 symbols, ISA-5.1 instrument tags and lines, live instrument bubbles and control loops',
            ],
            [
              'single-line (`single-line`)',
              'IEC 60617 or ANSI/IEEE 315 symbols, IEC 81346 tags',
            ],
            ['process flow (`pfd`)', 'ISO 10628-1 major equipment and streams'],
            [
              'fluid power (`fluid-power`)',
              'ISO 1219-1 hydraulic and pneumatic symbols, ISO 1219-2 layout and tags; cylinders stroke and valves shift as it runs',
            ],
          ],
        },
      },
      {
        p: `Engineering sheets carry an ISO 7200 title block and print on one page of ISO A paper. The drawing checks mark up what an engineer would: untagged equipment, unnumbered lines, a control valve no controller drives, a load with no breaker, a pump with no relief valve. Every symbol: [the symbol reference](${BLOB}/docs/reference/symbols.md).`,
      },
    ],
  },
  {
    id: 'formats',
    title: 'Import and export',
    blocks: [
      {
        table: {
          head: ['format', 'in', 'out'],
          rows: [
            ['Scene JSON', 'editor, examples, MCP', 'editor, examples, MCP'],
            [
              'Share link (`#scene=`)',
              'any page',
              'editor, examples, `share_link`',
            ],
            ['SVG', '', 'examples (↓ svg), `render_scene`'],
            ['PNG, PDF', '', '`render_scene`'],
            ['DEXPI 1.3 (Proteus XML)', '`import_dexpi`', '`export_dexpi`'],
            ['SFILES 2.0', '`import_sfiles`', '`export_sfiles`'],
          ],
        },
      },
      {
        p: 'A DEXPI file from plant design software opens as a living P&ID: equipment keeps its tags, each piping segment becomes lines with its valves in place, and the instrument loops keep the valves they drive. The file says nothing about behaviour, so each class gets a typical one and the import notes say so. SFILES 2.0, the line notation for flowsheets, opens as a PFD laid out by its flow.',
      },
    ],
  },
  {
    id: 'embed',
    title: 'Embedding and links',
    blocks: [
      {
        p: 'The URL is the API. Every way of showing a sheet is a query string on this site:',
      },
      {
        table: {
          head: ['address', 'shows'],
          rows: [
            ['(nothing)', 'the editor, on the sheet you left'],
            ['`?examples`', 'the built-in sheets, running'],
            [
              '`?scene=grid`',
              'one sheet running: `grid`, `solar-home`, `water-tower`, `hydro-dam`, `data-centre`, `garden-machine`',
            ],
            ['`#scene=…`', 'a whole scene file carried in the link'],
            [
              '`?build=1`',
              'the editor; with `#scene=…` or `?scene=`, on that sheet; `&drawing=pid` starts a P&ID',
            ],
            [
              '`?embed=1&scene=…`',
              'just the sheet and a play bar, for an iframe',
            ],
            [
              '`?embed=app`, `?embed=build`',
              'the examples or the editor without the header',
            ],
            [
              '`?screen=1`',
              'a full-bleed dark tour of every sheet, for a wall',
            ],
            ['`theme=light|dark`', 'the sheet’s palette'],
            ['`mode=paper`', 'frozen, every flow labelled, ready to print'],
            ['`t=18.5`, `speed=4`', 'open at 18:30; run four times as fast'],
            ['`credit=0`', 'leave off the “Made with Anigram” line'],
            ['`paused=1`', 'open with the clock stopped'],
            ['`controls=0`', 'leave off the play bar'],
          ],
        },
      },
      {
        code: `<iframe src="https://anigram.vaibhav.co.uk/?embed=1&scene=grid"
  title="The power grid" loading="lazy"
  style="width:100%;aspect-ratio:16/10;border:0"></iframe>`,
      },
      { h: 'Without an iframe: <living-diagram>' },
      {
        p: 'One script defines a `<living-diagram>` element that runs a sheet right in your page. It sits in its own shadow root, so your CSS can’t break the drawing and its CSS can’t leak into your page. It is as wide as its container and as tall as the sheet’s proportions make it, and it loads no analytics.',
      },
      {
        code: `<script type="module" src="https://anigram.vaibhav.co.uk/living-diagram.js"></script>

<living-diagram scene="water-tower"></living-diagram>`,
      },
      {
        code: `<living-diagram src="./my-plant.json" theme="auto" hour="18"></living-diagram>

<living-diagram>
  <script type="application/json">{ "anigram": 1, ...your scene... }</script>
</living-diagram>`,
      },
      {
        table: {
          head: ['attribute', 'does'],
          rows: [
            [
              '`src`',
              'the URL of a scene file (your server must allow the fetch)',
            ],
            [
              '`scene`',
              'a built-in sheet: `grid`, `solar-home`, `water-tower`, `hydro-dam`, `data-centre`, `garden-machine`',
            ],
            ['`share`', 'a `#scene=…` share link, or just the text after it'],
            [
              '`<script type="application/json">`',
              'a whole scene file inside the element',
            ],
            [
              '`theme`',
              '`light` (default), `dark`, or `auto` to follow the reader’s system',
            ],
            ['`hour`, `speed`', 'open at that hour; clock multiplier'],
            ['`paused`', 'open with the clock stopped'],
            ['`controls="false"`', 'leave off the play bar'],
            ['`credit="false"`', 'leave off the “Made with Anigram” line'],
            ['`mode="paper"`', 'frozen, every flow labelled'],
          ],
        },
      },
      {
        p: 'The first of `src`, `share`, an inline script and `scene` wins. Every scene is validated first: a bad one shows what is wrong in place of the sheet and fires an `error` event (`event.detail.errors`). A good one fires `load` with its `id` and `title`. Changing an attribute changes the running sheet.',
      },
    ],
  },
  {
    id: 'dev',
    title: 'Development notes',
    blocks: [
      {
        p: 'Anigram is a Vite + React + TypeScript app and an MCP server bundled from the same source. Everything outside `app/`, `editor/` and `site/` is React-free.',
      },
      {
        code: `src/
  sim/      the rulebook: types, solver, signal expressions, clock, day curves
  format/   scene files: validation, migration, day reports, share links, DEXPI, SFILES
  scenes/   the built-in sheets, as data
  parts/    the glyph library: one SVG function per kind of part
  view/     the drawing sheet: geometry, labels, title block, auto layout, layout lint
  packs/    the drawing practices: classes, symbols, starters, house-rule checks
  app/      the examples, embed and screen views, URL params
  element/  the <living-diagram> web component
  editor/   the editor: pure edits on a scene file, palettes, history
  site/     the header and these docs
mcp/        the MCP server (one bundled file, plus PNG and PDF renderers)
e2e/        browser tests and the screenshots they compare against
eval/       a real assistant building sheets with the server, scored`,
      },
      {
        code: `npm install
npm run dev        # the app on localhost
npm test           # the simulation's rules, golden days, formats
npm run test:mcp   # build the MCP server and drive it over stdio
npm run e2e -- --ignore-snapshots   # browser tests (after npm run build)
npm run bench      # time the solver on a 288-part town
npm run docs       # rewrite the reference docs from the code
npm run eval       # a real assistant builds sheets (costs tokens)`,
      },
      {
        list: [
          '**Golden days**: each built-in sheet’s hour-by-hour run is committed, so a change to the solver that alters a sheet shows up in review.',
          '**Screenshots**: CI compares every sheet in each drawing type with a picture taken in Playwright’s Docker image.',
          '**Evals**: prompts in `eval/prompts.json` are given to a real assistant with only the MCP server; each run records whether the sheet is valid, tells its story, and passes the drawing checks.',
          `**Releases**: one version covers the app, the npm package and the repo. A merged version bump and a tag publish \`anigram-mcp\` through npm’s trusted publishing; see [RELEASING.md](${BLOB}/RELEASING.md) and the [changelog](${BLOB}/CHANGELOG.md).`,
          `**Contributing**: issues and pull requests welcome, MIT, no CLA. See [CONTRIBUTING.md](${BLOB}/CONTRIBUTING.md).`,
        ],
      },
    ],
  },
  {
    id: 'next',
    title: 'Apps and what’s next',
    blocks: [
      {
        p: 'Desktop apps for Windows and for macOS (Apple silicon and Intel) are planned: the same editor, with your files on disk.',
      },
      {
        list: [
          'A hosted MCP endpoint, so an assistant can draw without installing anything.',
        ],
      },
      { p: `The full plan: [ROADMAP.md](${BLOB}/ROADMAP.md).` },
    ],
  },
  {
    id: 'support',
    title: 'Support and licence',
    blocks: [
      {
        p: `Anigram is free and MIT licensed, with no paid tier. If it is useful to you, you can [leave a tip](${SUPPORT_URL}). Bugs and ideas go in [GitHub issues](${REPO_URL}/issues).`,
      },
      { p: 'Made by Vaibhav Patel.' },
    ],
  },
]
