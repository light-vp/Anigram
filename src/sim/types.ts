// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The scene format. A scene is a list of parts (things) and links (what
 * moves between them). Nothing in here says how anything animates: every
 * moving pixel on the sheet is read off the simulation's state, so a diagram
 * cannot show something the system isn't doing.
 */

/** What flows along a link. Each domain is drawn differently on the sheet. */
export type Domain =
  'light' | 'electric' | 'water' | 'heat' | 'fuel' | 'mechanical' | 'data'

/** Domains whose flow is a rate of energy — used to account for losses. */
export const ENERGY_DOMAINS: ReadonlySet<Domain> = new Set([
  'light',
  'electric',
  'heat',
  'fuel',
  'mechanical',
])

export interface Units {
  /** a flow rate, e.g. `kW`, `L/s` */
  rate: string
  /** a stored amount, e.g. `kWh`, `L` */
  amount: string
}

/** What a time-varying input can read. `hour` runs 0–24 and wraps. */
export interface Env {
  hour: number
  day: number
  /** a slider value from the scene's `knobs` (0..1 unless the knob says otherwise) */
  knob: (id: string) => number
  /** whether a switch-type control is on */
  on: (id: string) => boolean
  /**
   * another part as it was last tick — for demand that follows something else,
   * like chillers that work as hard as the servers they cool
   */
  prev: (id: string) => { in: number; out: number; fill: number }
  /**
   * a part as it is now, with what it asked for — only when checking a
   * scene's `expect` list against a simulated day
   */
  part?: (id: string) => {
    in: number
    out: number
    fill: number
    demand: number
  }
}

/**
 * A number, or an expression that depends on the time of day and the
 * controls — `"32 * sun(hour) * (1 - 0.85 * knob('cloud'))"`. See `expr.ts`
 * for the language. Expressions are what keep a scene plain JSON, and every
 * built-in sheet uses them; a function is still accepted for scenes built in
 * code (the playground's presets), but it can't be saved to a file.
 */
export type Signal = number | string | ((env: Env) => number)

export type Behaviour =
  /** produces up to `output`; dispatchable ones only burn fuel to cover a shortfall */
  | { role: 'source'; output: Signal; dispatchable?: boolean; merit?: number }
  /**
   * consumes up to `demand`. Higher `priority` is served first. A sink that
   * `absorbsSurplus` (export, a spillway) only takes what nobody else wanted.
   */
  | {
      role: 'sink'
      demand: Signal
      priority?: number
      absorbsSurplus?: boolean
    }
  /** a junction: a busbar, a manifold. Pulls from its inputs cheapest first. */
  | { role: 'bus' }
  /** passes flow through, limited to `capacity × open` — a valve, a breaker */
  | { role: 'gate'; capacity: number; open?: Signal }
  /**
   * turns inputs into an output. `recipe` is how much of each input domain one
   * unit of output takes, so a 40%-efficient gas plant is `{ fuel: 2.5 }`.
   * Energy that goes in but doesn't come out leaves along a `loss` link.
   */
  | {
      role: 'converter'
      output: Domain
      recipe: Partial<Record<Domain, number>>
      capacity?: number
      /** hours it must be asked for before it delivers anything — a diesel set cranking up */
      startup?: number
    }
  /**
   * stores flow. By default it only charges from surplus (sun nobody used);
   * `refill` makes it a float switch: start below one fraction, stop at another.
   */
  | {
      role: 'storage'
      capacity: number
      start?: number
      /** fastest it can charge / discharge; a signal lets an operator hold a store back for the peak */
      maxIn: Signal
      maxOut: Signal
      efficiency?: number
      merit?: number
      refill?: { below: number; until: number }
    }
  /** where losses and spills end up: the sky, a river, a cooling tower */
  | { role: 'vent' }

export type LabelSide = 'below' | 'above' | 'left' | 'right'

/**
 * What kind of drawing the sheet is. `pictorial` is Anigram's own picture
 * style; the others follow an engineering drawing practice, each drawn by
 * its own pack of symbols and rules (see src/packs).
 */
export type DrawingType = 'pictorial' | 'pid' | 'single-line' | 'pfd'

/** which symbol standard a single-line draws in */
export type SymbolSet = 'iec' | 'ansi'

/**
 * What a line on an engineering drawing stands for, which sets how it is
 * drawn: a process line solid and heavy, a signal dashed, and so on.
 */
export type LineType = 'process' | 'utility' | 'signal' | 'pneumatic' | 'data'

/** The title block's fields (after ISO 7200), beside the sheet's title and number */
export interface TitleBlock {
  /** the organisation the drawing belongs to */
  owner?: string
  project?: string
  /** the people who drew, checked and approved it */
  drawnBy?: string
  checkedBy?: string
  approvedBy?: string
  /** date of issue, YYYY-MM-DD */
  issued?: string
  revision?: string
  /** e.g. "for review", "issued for construction" */
  status?: string
}

export interface PartSpec {
  id: string
  /** which glyph to draw — see src/parts */
  kind: string
  label: string
  /** grid cell, column then row */
  at: [number, number]
  behaviour: Behaviour
  /** one or two plain sentences: what this part is and what it does here */
  note?: string
  labelSide?: LabelSide
  /** a switch-type control id; clicking the part flips it */
  toggles?: string
  /**
   * the part's tag on an engineering drawing: `P-101`, `FIC-101`, `-QA1`.
   * Unique on the sheet.
   */
  tag?: string
  /**
   * what exactly it is, in the drawing practice's own vocabulary (DEXPI class
   * names on a P&ID: `CentrifugalPump`, `GateValve`). Picks the symbol; the
   * `kind` still picks the pictorial glyph.
   */
  class?: string
}

export interface LinkSpec {
  from: string
  to: string
  domain: Domain
  /** the most this link can carry; flows are clipped to it */
  capacity?: number
  /** grid-cell waypoints between the two parts */
  via?: Array<[number, number]>
  /** for a straight two-point link that isn't aligned: horizontal-first or vertical-first */
  bend?: 'hv' | 'vh'
  /** carries the `from` converter's losses rather than its product */
  loss?: boolean
  /** how an engineering drawing draws it; by default a process line, or a signal for data */
  line?: LineType
  /** the line number on an engineering drawing, e.g. `50-W-101` */
  tag?: string
}

export interface Knob {
  id: string
  label: string
  min?: number
  max?: number
  step?: number
  value: number
  /**
   * how to print the value next to the slider: `{pct}` is the value as a
   * whole percentage, `{value}` the raw number — `"{pct}% open"`. A function
   * works in code but not in a scene file.
   */
  format?: string | ((value: number) => string)
}

export interface Switch {
  id: string
  label: string
  on: boolean
}

/**
 * A line of the story the sheet tells, as a check on the simulated day:
 * "the battery runs flat overnight" as `part('battery').fill < 0.05` at 23:00.
 * `simulate_scene` and `check_scene` report each one, and CI holds the
 * built-in sheets to theirs.
 */
export interface Expectation {
  /** the claim in words, as a reader would put it */
  says: string
  /** an expression that is true (non-zero) when the claim holds */
  check: string
  /** the one hour it must hold at */
  at?: number
  /** a window of hours, inclusive at both ends; wraps past midnight if from > to */
  from?: number
  to?: number
  /** true: holding at any one checked hour is enough, not every hour */
  sometime?: boolean
}

export interface Caption {
  /** hours, inclusive start, exclusive end; wraps past midnight if from > to */
  from: number
  to: number
  text: string
}

/** where an instrument is, which ISA-5.1 draws by what crosses its bubble */
export type InstrumentMounting =
  'field' | 'panel' | 'behind-panel' | 'dcs' | 'plc'

/**
 * an instrument on a P&ID: an ISA-5.1 bubble with its tag, joined to the part
 * it measures and, for a controller, to the valve it drives, with its reading
 * live beside it
 */
export interface InstrumentSpec {
  /** what it measures and does, then the loop number: `LT-101`, `FIC-102` */
  tag: string
  /** grid cell, column then row */
  at: [number, number]
  /** the part it is connected to; a thin process connection runs there */
  measures: string
  /**
   * what it reads, as an expression over parts as they are now:
   * `part('tank').fill * 100`. A level (L) or flow (F) instrument reads its
   * part's fill or flow when left out.
   */
  reads?: string
  /** the reading's unit, shown after it */
  unit?: string
  /** the final element it drives, such as a control valve; a signal line runs there */
  drives?: string
  /** how that signal travels: electric (dashed, the default), pneumatic or data */
  signal?: 'signal' | 'pneumatic' | 'data'
  /** field (the default), panel, behind-panel, dcs or plc */
  mounting?: InstrumentMounting
  /** the reading shows as an alarm below `low` or above `high` */
  low?: number
  high?: number
}

export interface Scene {
  /**
   * the scene format's version (see src/format/migrate.ts). Files and links
   * always carry it; a scene written in code can leave it out.
   */
  anigram?: number
  id: string
  title: string
  /** one line under the title */
  subtitle: string
  /** drawing number for the title block, e.g. `LD-001` */
  sheet: string
  /** the drawing practice the sheet follows; pictorial when left out */
  drawing?: DrawingType
  /** a single-line's symbol standard, IEC 60617 or ANSI/IEEE 315; IEC when left out */
  symbols?: SymbolSet
  titleBlock?: TitleBlock
  /** columns × rows of the grid the parts sit on */
  size: [number, number]
  units: Partial<Record<Domain, Units>>
  /** per-domain flow that draws a link at full width */
  scale: Partial<Record<Domain, number>>
  parts: PartSpec[]
  links: LinkSpec[]
  /** instruments, drawn on a P&ID */
  instruments?: InstrumentSpec[]
  knobs?: Knob[]
  switches?: Switch[]
  captions?: Caption[]
  expect?: Expectation[]
  clock: {
    /** hour of day the scene opens at */
    start: number
    /** simulated hours per real second at 1× */
    rate: number
  }
}
