// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { heating, home, shift, sun, traffic, water } from '../sim/profiles.ts'
import type {
  Behaviour,
  Domain,
  PartSpec,
  Switch,
  Units,
} from '../sim/types.ts'

/*
 * The parts a person can drop on a sheet. Each template writes a plain scene
 * part (numbers and expression strings, never functions), so whatever the
 * editor makes is exactly what a file holds and what an assistant would
 * write. A template has one number worth turning, its size, and a shape for
 * the day; both stay visible in the part's signals (`2.4 * home(hour) / 1.2`)
 * so the editor can read them back and offer the slider again.
 */

export type ProfileId =
  'flat' | 'sun' | 'wind' | 'home' | 'shift' | 'heating' | 'water' | 'traffic'

/** the busiest value of a day curve, sampled as the old playground did */
function peakOf(f: (hour: number) => number): number {
  let max = 0
  for (let h = 0; h < 24; h += 0.05) max = Math.max(max, f(h))
  return max || 1
}

/** a number as an expression writes it: short, but exact enough */
export const fmt = (n: number) => String(Number(n.toPrecision(6)))

/** a curve that peaks at exactly 1, as an expression */
const scaled = (fn: string, f: (hour: number) => number) => {
  const peak = peakOf(f)
  return Math.abs(peak - 1) < 1e-9
    ? `${fn}(hour)`
    : `${fn}(hour) / ${fmt(peak)}`
}

/**
 * The shapes of a day a part can follow, each an expression that peaks at 1,
 * so a part's size is its busiest value. `flat` is no shape at all.
 */
export const PROFILES: Record<ProfileId, { label: string; shape?: string }> = {
  flat: { label: 'steady' },
  sun: { label: 'daylight', shape: scaled('sun', sun) },
  wind: { label: 'gusty', shape: 'wind(hour, day)' },
  home: { label: 'a home’s day', shape: scaled('home', home) },
  shift: { label: 'a working shift', shape: scaled('shift', shift) },
  heating: { label: 'heating hours', shape: scaled('heating', heating) },
  water: { label: 'showers & dinner', shape: scaled('water', water) },
  traffic: { label: 'evening peak', shape: scaled('traffic', traffic) },
}

/** size × shape as a signal: a plain number when the shape is flat */
export const signalOf = (size: number, shape?: string): number | string =>
  shape ? `${fmt(size)} * ${shape}` : size

/**
 * Read a signal back as a size and whatever multiplies it, when it has that
 * form: `7 * on('car')` is size 7 times `on('car')`, `30` is size 30. Lets the
 * inspector offer a slider on any part, not only one the editor made.
 */
export function dialOf(
  signal: unknown,
): { size: number; shape?: string } | undefined {
  if (typeof signal === 'number') return { size: signal }
  if (typeof signal !== 'string') return undefined
  const m = /^\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*(?:\*\s*(.+?))?\s*$/i.exec(
    signal,
  )
  if (!m) return undefined
  return m[2] ? { size: Number(m[1]), shape: m[2] } : { size: Number(m[1]) }
}

/** the profile a shape expression is, if it is one of ours */
export function profileOf(shape: string | undefined): ProfileId | undefined {
  if (!shape) return 'flat'
  return (Object.keys(PROFILES) as ProfileId[]).find(
    (id) => PROFILES[id].shape === shape,
  )
}

export type Group = 'make' | 'convert' | 'carry' | 'store' | 'use'

export const GROUPS: Array<{ id: Group; label: string }> = [
  { id: 'make', label: 'Make' },
  { id: 'convert', label: 'Convert' },
  { id: 'carry', label: 'Carry' },
  { id: 'store', label: 'Store' },
  { id: 'use', label: 'Use' },
]

/** what a template's behaviour is built from */
export interface Dial {
  size: number
  /** the profile's curve, peaking at 1, or nothing for a steady part */
  shape?: string
  /** whether this part's own switch is on, as an expression */
  on: string
}

export interface Template {
  kind: string
  name: string
  group: Group
  /** domains it can take in, and give out */
  takes: Domain[]
  gives: Domain[]
  /** the one number worth turning; absent for junctions */
  size?: { label: string; value: number; unit: string; max: number }
  /** the shapes of a day it can follow; the first is the default */
  profiles?: ProfileId[]
  /** a part you can switch: what "on" means for it */
  switch?: { on: string; off: string; start: boolean }
  note: string
  behaviour: (d: Dial) => Behaviour
}

export const UNITS: Record<Domain, Units> = {
  light: { rate: 'kW', amount: 'kWh' },
  electric: { rate: 'kW', amount: 'kWh' },
  heat: { rate: 'kW', amount: 'kWh' },
  fuel: { rate: 'kW', amount: 'kWh' },
  mechanical: { rate: 'kW', amount: 'kWh' },
  water: { rate: 'm³/h', amount: 'm³' },
  data: { rate: 'req/s', amount: 'req' },
  oil: { rate: 'L/min', amount: 'L' },
  air: { rate: 'L/min', amount: 'L' },
}

const TEMPLATE_LIST: Template[] = [
  // make
  {
    kind: 'sun',
    name: 'Sun',
    group: 'make',
    takes: [],
    gives: ['light'],
    size: { label: 'sunlight at noon', value: 30, unit: 'kW', max: 200 },
    profiles: ['sun'],
    note: 'Light on a roof. Feed it to solar panels.',
    behaviour: ({ size, shape }) => ({
      role: 'source',
      output: signalOf(size, shape),
    }),
  },
  {
    kind: 'wind',
    name: 'Wind turbine',
    group: 'make',
    takes: [],
    gives: ['electric'],
    size: { label: 'rated output', value: 5, unit: 'kW', max: 200 },
    profiles: ['wind', 'flat'],
    note: 'Free once built, but it blows when it blows.',
    behaviour: ({ size, shape }) => ({
      role: 'source',
      output: signalOf(size, shape),
    }),
  },
  {
    kind: 'gaswell',
    name: 'Gas supply',
    group: 'make',
    takes: [],
    gives: ['fuel'],
    size: { label: 'most it can pipe', value: 40, unit: 'kW', max: 400 },
    note: 'Fuel on demand. Only burned when nothing cheaper can cover the load.',
    behaviour: ({ size }) => ({
      role: 'source',
      output: size,
      dispatchable: true,
    }),
  },
  {
    kind: 'grid',
    name: 'Grid connection',
    group: 'make',
    takes: ['electric'],
    gives: ['electric'],
    size: { label: 'connection', value: 15, unit: 'kW', max: 200 },
    note: 'Imports whatever you can’t make; exports whatever you can’t use or store. Always the last resort.',
    behaviour: ({ size }) => ({
      role: 'storage',
      capacity: 1e6,
      start: 0.5,
      maxIn: size,
      maxOut: size,
      merit: 30,
    }),
  },
  {
    kind: 'air',
    name: 'Outside air',
    group: 'make',
    takes: [],
    gives: ['heat'],
    note: 'Even cold air holds heat a heat pump can take.',
    behaviour: () => ({ role: 'source', output: 100 }),
  },
  {
    kind: 'well',
    name: 'Borehole',
    group: 'make',
    takes: [],
    gives: ['water'],
    note: 'Groundwater. It is always there; the limit is how fast you can lift it.',
    behaviour: () => ({ role: 'source', output: 1000 }),
  },

  // convert
  {
    kind: 'pv',
    name: 'Solar panels',
    group: 'convert',
    takes: ['light'],
    gives: ['electric'],
    size: { label: 'peak output', value: 6, unit: 'kW', max: 100 },
    note: 'A fifth of the light becomes electricity.',
    behaviour: ({ size }) => ({
      role: 'converter',
      output: 'electric',
      recipe: { light: 5 },
      capacity: size,
    }),
  },
  {
    kind: 'gasplant',
    name: 'Gas generator',
    group: 'convert',
    takes: ['fuel'],
    gives: ['electric'],
    size: { label: 'capacity', value: 10, unit: 'kW', max: 200 },
    note: 'Burns 2.2 units of fuel for every unit of electricity.',
    behaviour: ({ size }) => ({
      role: 'converter',
      output: 'electric',
      recipe: { fuel: 2.2 },
      capacity: size,
    }),
  },
  {
    kind: 'heatpump',
    name: 'Heat pump',
    group: 'convert',
    takes: ['electric', 'heat'],
    gives: ['heat'],
    size: { label: 'heat output', value: 9, unit: 'kW', max: 60 },
    note: 'Wire it to electricity and outside air. One unit of electricity brings in more than two of free heat.',
    behaviour: ({ size }) => ({
      role: 'converter',
      output: 'heat',
      recipe: { electric: 0.3, heat: 0.7 },
      capacity: size,
    }),
  },
  {
    kind: 'pump',
    name: 'Pump',
    group: 'convert',
    takes: ['electric', 'water'],
    gives: ['water'],
    size: { label: 'flat out', value: 95, unit: 'm³/h', max: 600 },
    note: 'Lifts water using electricity. Give it both.',
    behaviour: ({ size }) => ({
      role: 'converter',
      output: 'water',
      recipe: { electric: 0.45, water: 1 },
      capacity: size,
    }),
  },

  // carry
  {
    kind: 'busbar',
    name: 'Busbar',
    group: 'carry',
    takes: ['electric'],
    gives: ['electric'],
    note: 'A junction for electricity. It asks its cheapest input first.',
    behaviour: () => ({ role: 'bus' }),
  },
  {
    kind: 'breaker',
    name: 'Breaker',
    group: 'carry',
    takes: ['electric'],
    gives: ['electric'],
    switch: { on: 'closed', off: 'tripped', start: true },
    note: 'Trip it and everything downstream goes dark.',
    behaviour: ({ on }) => ({ role: 'gate', capacity: 1e4, open: on }),
  },
  {
    kind: 'manifold',
    name: 'Manifold',
    group: 'carry',
    takes: ['water'],
    gives: ['water'],
    note: 'A junction for water.',
    behaviour: () => ({ role: 'bus' }),
  },
  {
    kind: 'valve',
    name: 'Valve',
    group: 'carry',
    takes: ['water'],
    gives: ['water'],
    switch: { on: 'open', off: 'shut', start: true },
    note: 'Shut it and the water stops here.',
    behaviour: ({ on }) => ({ role: 'gate', capacity: 1e4, open: on }),
  },

  // store
  {
    kind: 'battery',
    name: 'Battery',
    group: 'store',
    takes: ['electric'],
    gives: ['electric'],
    size: { label: 'holds', value: 10, unit: 'kWh', max: 200 },
    note: 'Fills only from power nobody was using, and empties when it’s needed.',
    behaviour: ({ size }) => ({
      role: 'storage',
      capacity: size,
      start: 0.6,
      maxIn: Number(fmt(size * 0.35)),
      maxOut: Number(fmt(size * 0.5)),
      efficiency: 0.92,
    }),
  },
  {
    kind: 'watertower',
    name: 'Water tower',
    group: 'store',
    takes: ['water'],
    gives: ['water'],
    size: { label: 'holds', value: 450, unit: 'm³', max: 3000 },
    note: 'A float switch asks for water below 40% and stops at 95%. Gravity does the rest.',
    behaviour: ({ size }) => ({
      role: 'storage',
      capacity: size,
      start: 0.85,
      maxIn: size,
      maxOut: size * 2,
      refill: { below: 0.4, until: 0.95 },
    }),
  },

  // use
  {
    kind: 'house',
    name: 'House',
    group: 'use',
    takes: ['electric'],
    gives: [],
    size: { label: 'evening peak', value: 2.4, unit: 'kW', max: 50 },
    profiles: ['home', 'flat', 'shift'],
    note: 'Kettle, fridge, lights. Peaks at breakfast and dinner.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
      priority: 1,
    }),
  },
  {
    kind: 'car',
    name: 'Electric car',
    group: 'use',
    takes: ['electric'],
    gives: [],
    size: { label: 'charger', value: 7, unit: 'kW', max: 50 },
    switch: { on: 'plugged in', off: 'unplugged', start: false },
    note: 'Plug it in and watch what has to work harder.',
    behaviour: ({ size, on }) => ({
      role: 'sink',
      demand: signalOf(size, on),
    }),
  },
  {
    kind: 'factory',
    name: 'Workshop',
    group: 'use',
    takes: ['electric'],
    gives: [],
    size: { label: 'flat out', value: 8, unit: 'kW', max: 200 },
    profiles: ['shift', 'flat', 'home'],
    note: 'Runs one shift, seven till seven.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
    }),
  },
  {
    kind: 'hospital',
    name: 'Hospital',
    group: 'use',
    takes: ['electric'],
    gives: [],
    size: { label: 'load', value: 4, unit: 'kW', max: 100 },
    profiles: ['flat', 'home'],
    note: 'Served before anything else on the same supply.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
      priority: 5,
    }),
  },
  {
    kind: 'servers',
    name: 'Servers',
    group: 'use',
    takes: ['electric'],
    gives: [],
    size: { label: 'busiest', value: 6, unit: 'kW', max: 200 },
    profiles: ['traffic', 'flat'],
    note: 'Busiest in the evening, when everyone is online.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
      priority: 2,
    }),
  },
  {
    kind: 'radiator',
    name: 'Radiators',
    group: 'use',
    takes: ['heat'],
    gives: [],
    size: { label: 'coldest hour', value: 7, unit: 'kW', max: 60 },
    profiles: ['heating', 'flat'],
    note: 'On early, off while everyone is out, on all evening.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
    }),
  },
  {
    kind: 'tap',
    name: 'Taps',
    group: 'use',
    takes: ['water'],
    gives: [],
    size: { label: 'busiest', value: 150, unit: 'm³/h', max: 2000 },
    profiles: ['water', 'flat'],
    note: 'Everyone showers at the same time.',
    behaviour: ({ size, shape }) => ({
      role: 'sink',
      demand: signalOf(size, shape),
      priority: 1,
    }),
  },
]

export const TEMPLATES: ReadonlyMap<string, Template> = new Map(
  TEMPLATE_LIST.map((t) => [t.kind, t]),
)

export const TEMPLATES_BY_GROUP = GROUPS.map((g) => ({
  ...g,
  templates: TEMPLATE_LIST.filter((t) => t.group === g.id),
}))

export interface Made {
  part: PartSpec
  /** the part's own switch, for a template that has one */
  switch?: Switch
}

/**
 * A new part from a template. Left out, the size is the template's and the
 * day follows its first profile; a switch starts as the template says.
 */
export function makePart(
  t: Template,
  o: {
    id: string
    at: [number, number]
    label?: string
    size?: number
    profile?: ProfileId
    on?: boolean
  },
): Made {
  const size = o.size ?? t.size?.value ?? 0
  const profile = o.profile ?? t.profiles?.[0] ?? 'flat'
  const part: PartSpec = {
    id: o.id,
    kind: t.kind,
    label: o.label?.trim() || t.name,
    at: o.at,
    behaviour: t.behaviour({
      size,
      shape: PROFILES[profile].shape,
      on: `on('${o.id}')`,
    }),
    note: t.note,
  }
  if (!t.switch) return { part }
  part.toggles = o.id
  return {
    part,
    switch: { id: o.id, label: part.label, on: o.on ?? t.switch.start },
  }
}

/** the part that feeds a domain from off the drawing, when a practice hides it */
export const SUPPLY: Partial<Record<Domain, string>> = {
  electric: 'grid',
  fuel: 'gaswell',
  heat: 'air',
  light: 'sun',
  water: 'well',
}
