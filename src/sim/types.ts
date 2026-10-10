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

export interface Caption {
  /** hours, inclusive start, exclusive end; wraps past midnight if from > to */
  from: number
  to: number
  text: string
}

export interface Scene {
  id: string
  title: string
  /** one line under the title */
  subtitle: string
  /** drawing number for the title block, e.g. `LD-001` */
  sheet: string
  /** columns × rows of the grid the parts sit on */
  size: [number, number]
  units: Partial<Record<Domain, Units>>
  /** per-domain flow that draws a link at full width */
  scale: Partial<Record<Domain, number>>
  parts: PartSpec[]
  links: LinkSpec[]
  knobs?: Knob[]
  switches?: Switch[]
  captions?: Caption[]
  clock: {
    /** hour of day the scene opens at */
    start: number
    /** simulated hours per real second at 1× */
    rate: number
  }
}
