// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PACKS, classOf, shows } from '../packs/catalogue.ts'
import { suggestLineNumber, suggestTag } from '../packs/checks.ts'
import { splitTag } from '../sim/instruments.ts'
import type {
  Behaviour,
  Domain,
  DrawingType,
  InstrumentSpec,
  PartSpec,
} from '../sim/types.ts'
import {
  addInstrument,
  addPart,
  connect,
  freeCellNear,
  instrumentAt,
  nextId,
  partAt,
} from './doc.ts'
import type { Cell, Doc, Result } from './doc.ts'
import {
  PROFILES,
  SUPPLY,
  TEMPLATES,
  TEMPLATES_BY_GROUP,
  makePart,
} from './templates.ts'

/*
 * What the palette offers on each kind of sheet. A pictorial sheet offers
 * the templates; an engineering sheet offers the practice's own symbols,
 * each a template underneath with its class set and the next free tag, so a
 * pump dropped on a P&ID arrives as P-102 and already runs. Whatever the
 * practice leaves off the drawing (a pump's power, a generator's fuel) is fed
 * by a supply that stays off the sheet.
 */

export interface PaletteItem {
  /** unique within the palette */
  key: string
  name: string
  /** the template the part is made from, or 'instrument' */
  template: string
  /** the class it is drawn as on this sheet */
  class?: string
  /** behaviour fields that differ from the template's */
  behaviour?: Partial<Behaviour>
  /** an instrument's letters: LT, FIC… */
  letters?: string
  note?: string
}

export interface PaletteGroup {
  id: string
  label: string
  items: PaletteItem[]
}

const item = (
  cls: string,
  template: string,
  extra: Partial<PaletteItem> = {},
): PaletteItem => ({
  key: cls,
  name: spaced(cls),
  template,
  class: cls,
  ...extra,
})

/** CentrifugalPump → Centrifugal pump */
export const spaced = (cls: string) =>
  cls
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`)

const passes = (capacity: number): Partial<Behaviour> =>
  ({
    role: 'gate',
    capacity,
  }) as Partial<Behaviour>

const PID_GROUPS: PaletteGroup[] = [
  {
    id: 'ends',
    label: 'Off the sheet',
    items: [
      item('OffPageConnector', 'well', {
        key: 'from-off-sheet',
        name: 'From off-sheet',
        note: 'Where a line comes onto the sheet: a supply from another drawing.',
        behaviour: { role: 'source', output: 200 } as Partial<Behaviour>,
      }),
      item('OffPageConnector', 'tap', {
        key: 'to-off-sheet',
        name: 'To off-sheet',
        note: 'Where a line leaves the sheet: a consumer on another drawing.',
      }),
    ],
  },
  {
    id: 'machines',
    label: 'Machines',
    items: [
      item('CentrifugalPump', 'pump'),
      item('PositiveDisplacementPump', 'pump'),
      item('Compressor', 'pump'),
      item('Fan', 'pump'),
    ],
  },
  {
    id: 'vessels',
    label: 'Vessels',
    items: [
      item('Tank', 'watertower'),
      item('Vessel', 'watertower'),
      item('HeatExchanger', 'valve', {
        behaviour: passes(1e4),
        note: 'Passes the line through; the heat it moves is not modelled here.',
      }),
      item('Filter', 'valve', { behaviour: passes(1e4) }),
    ],
  },
  {
    id: 'valves',
    label: 'Valves',
    items: [
      item('GateValve', 'valve'),
      item('GlobeValve', 'valve'),
      item('BallValve', 'valve'),
      item('CheckValve', 'valve', { behaviour: passes(1e4) }),
      item('ControlValve', 'valve', {
        behaviour: {
          role: 'gate',
          capacity: 1e4,
          open: 1,
        } as Partial<Behaviour>,
        note: 'Opens as its signal says. Point a controller at it, then write its "open" signal.',
      }),
      item('Junction', 'manifold'),
    ],
  },
  {
    id: 'instruments',
    label: 'Instruments',
    items: [
      ['LT', 'Level transmitter'],
      ['FT', 'Flow transmitter'],
      ['PT', 'Pressure transmitter'],
      ['TT', 'Temperature transmitter'],
      ['LIC', 'Level controller'],
      ['FIC', 'Flow controller'],
      ['PI', 'Pressure gauge'],
    ].map(([letters, name]) => ({
      key: letters!,
      name: `${letters} ${name!.toLowerCase()}`,
      template: 'instrument',
      letters,
      note: 'Click the part it measures, or another instrument it reads.',
    })),
  },
]

const SLD_GROUPS: PaletteGroup[] = [
  {
    id: 'sources',
    label: 'Sources',
    items: [
      item('Grid', 'grid'),
      item('Generator', 'gasplant'),
      item('PhotovoltaicArray', 'pv', { name: 'PV array' }),
      item('Battery', 'battery'),
    ],
  },
  {
    id: 'switchgear',
    label: 'Switchgear',
    items: [
      item('Busbar', 'busbar'),
      item('CircuitBreaker', 'breaker'),
      item('Disconnector', 'breaker'),
      item('Fuse', 'breaker', { behaviour: passes(1e4) }),
      item('Transformer', 'breaker', { behaviour: passes(1e4) }),
      item('Inverter', 'breaker', { behaviour: passes(1e4) }),
    ],
  },
  {
    id: 'loads',
    label: 'Loads',
    items: [
      item('Load', 'factory'),
      item('Motor', 'factory', { name: 'Motor' }),
    ],
  },
]

/** a part that takes whatever reaches it: a return to the tank, air let go */
const takesAll = (): Partial<Behaviour> =>
  ({
    role: 'sink',
    demand: 1e4,
    absorbsSurplus: true,
  }) as Partial<Behaviour>

const FP_GROUPS: PaletteGroup[] = [
  {
    id: 'supply',
    label: 'Supply',
    items: [
      item('Reservoir', 'well', {
        key: 'tank-supply',
        name: 'Tank',
        note: 'The oil the pump draws on.',
        behaviour: { role: 'source', output: 1000 } as Partial<Behaviour>,
      }),
      item('HydraulicPump', 'powerpack', { name: 'Pump' }),
      item('VariablePump', 'powerpack'),
      item('AirCompressor', 'compressor'),
      item('ElectricMotor', 'motor'),
    ],
  },
  {
    id: 'valves',
    label: 'Valves',
    items: [
      item('DirectionalValve43', 'dcv', { name: '4/3 valve' }),
      item('DirectionalValve42', 'dcv', { name: '4/2 valve' }),
      item('DirectionalValve52', 'dcv', { name: '5/2 valve' }),
      item('DirectionalValve32', 'dcv', { name: '3/2 valve' }),
      item('ReliefValve', 'valve', { behaviour: passes(1e4) }),
      item('ReducingValve', 'valve', { behaviour: passes(1e4) }),
      item('NonReturnValve', 'valve', { behaviour: passes(1e4) }),
      item('ThrottleValve', 'valve'),
      item('FlowControlValve', 'valve', { behaviour: passes(1e4) }),
      item('ShuttleValve', 'valve', { behaviour: passes(1e4) }),
      item('ShutOffValve', 'valve'),
    ],
  },
  {
    id: 'actuators',
    label: 'Actuators',
    items: [
      item('DoubleActingCylinder', 'cylinder'),
      item('SingleActingCylinder', 'cylinder'),
      item('HydraulicMotor', 'tap', {
        behaviour: { role: 'sink', demand: 40 } as Partial<Behaviour>,
      }),
      item('PneumaticMotor', 'tap', {
        behaviour: { role: 'sink', demand: 500 } as Partial<Behaviour>,
      }),
    ],
  },
  {
    id: 'conditioning',
    label: 'Conditioning and returns',
    items: [
      item('Filter', 'valve', { behaviour: passes(1e4) }),
      item('AirServiceUnit', 'valve', {
        name: 'Air service unit',
        behaviour: passes(1e4),
      }),
      item('Accumulator', 'accumulator'),
      item('PressureGauge', 'tap', {
        behaviour: { role: 'sink', demand: 0 } as Partial<Behaviour>,
      }),
      item('Reservoir', 'tap', {
        key: 'tank-return',
        name: 'Tank return',
        note: 'Where a return line ends: drawn as the tank, as often as it is needed.',
        behaviour: takesAll(),
      }),
      item('Silencer', 'tap', { behaviour: takesAll() }),
      item('Exhaust', 'tap', { behaviour: takesAll() }),
      item('Junction', 'manifold'),
    ],
  },
]

/** the kind a class is drawn as on the pictorial sheet, where it differs from its template's */
const KIND_FOR: Record<string, string> = {
  Fan: 'fan',
  Compressor: 'heatpump',
  Vessel: 'hottank',
  HeatExchanger: 'treatment',
  Filter: 'treatment',
  Junction: 'manifold',
  Transformer: 'transformer',
  Inverter: 'inverter',
  Fuse: 'breaker',
  Disconnector: 'breaker',
  Generator: 'generator',
  Load: 'city',
  Reservoir: 'oiltank',
  ElectricMotor: 'motor',
  HydraulicMotor: 'turbine',
  PneumaticMotor: 'turbine',
  AirServiceUnit: 'treatment',
  Silencer: 'sky',
  Exhaust: 'sky',
}

export function paletteFor(drawing: DrawingType | undefined): PaletteGroup[] {
  if (drawing === 'pid') return PID_GROUPS
  if (drawing === 'pfd')
    return PID_GROUPS.filter((g) => g.id !== 'valves' && g.id !== 'instruments')
  if (drawing === 'single-line') return SLD_GROUPS
  if (drawing === 'fluid-power') return FP_GROUPS
  return TEMPLATES_BY_GROUP.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.templates.map((t) => ({
      key: t.kind,
      name: t.name,
      template: t.kind,
      note: t.note,
    })),
  }))
}

export function findItem(
  drawing: DrawingType | undefined,
  key: string,
): PaletteItem | undefined {
  for (const g of paletteFor(drawing))
    for (const i of g.items) if (i.key === key) return i
  return undefined
}

/**
 * The supply that feeds a domain from off the drawing: one per domain, made
 * the first time a part needs it, on a free cell but never drawn.
 */
function supplyFor(
  doc: Doc,
  d: Domain,
  near: Cell,
  need: number,
): { doc: Doc; id: string } | undefined {
  const kind = SUPPLY[d]
  if (!kind) return undefined
  const existing = doc.parts.find(
    (p) =>
      p.kind === kind &&
      p.behaviour.role === 'source' &&
      doc.links.every((l) => l.from !== p.id || l.domain === d) &&
      !shows({ from: p.id, to: p.id, domain: d }, doc),
  )
  if (existing) return { doc, id: existing.id }
  const at = freeCellNear(doc, near)
  if (!at) return undefined
  const t = TEMPLATES.get(kind)!
  const id = nextId(
    doc,
    d === 'electric' ? 'power' : d === 'fuel' ? 'fuel' : kind,
  )
  const part: PartSpec = {
    id,
    kind,
    label: d === 'electric' ? 'Power' : t.name,
    at,
    // sunlight keeps its day; anything else comes when it is asked for
    behaviour:
      d === 'light'
        ? t.behaviour({ size: need, shape: PROFILES.sun.shape, on: '1' })
        : { role: 'source', output: Math.max(1000, need), dispatchable: true },
    note: `Feeds the ${d} this drawing leaves off.`,
  }
  return { doc: addPart(doc, part), id }
}

/** drop a palette item on an empty cell */
export function place(
  doc: Doc,
  it: PaletteItem,
  at: Cell,
): Result & { id?: string } {
  if (!isInside(doc, at)) return { error: 'That square is off the sheet.' }
  if (it.template === 'instrument')
    return { error: 'Click the part it measures.' }
  if (partAt(doc, at) || instrumentAt(doc, at) >= 0)
    return { error: 'That square is taken; pick an empty one.' }
  const t = TEMPLATES.get(it.template)
  if (!t) return { error: `No part called ${it.template}.` }
  const id = nextId(doc, it.class ? spaced(it.class).split(' ').pop()! : t.kind)
  const made = makePart(t, { id, at, label: it.class ? it.name : undefined })
  const part: PartSpec = { ...made.part }
  if (it.class && KIND_FOR[it.class]) part.kind = KIND_FOR[it.class]!
  if (it.behaviour) {
    part.behaviour = { ...it.behaviour } as Behaviour
    delete part.toggles
  }
  if (it.note) part.note = it.note
  const drawing = doc.drawing
  if (it.class && drawing && drawing !== 'pictorial') {
    part.class = it.class
    const tag = suggestTag(
      drawing,
      it.class,
      doc.parts.map((p) => p.tag),
    )
    if (tag) part.tag = tag
  }
  let next = addPart(doc, part, part.toggles ? made.switch : undefined)
  // what the practice leaves off the drawing comes from a supply off the sheet
  if (drawing && drawing !== 'pictorial') {
    for (const d of t.takes) {
      if (part.behaviour.role !== 'converter') break
      if (shows({ from: id, to: id, domain: d }, doc)) continue
      const b = part.behaviour
      const s = supplyFor(next, d, at, (b.capacity ?? 100) * (b.recipe[d] ?? 1))
      if (!s) continue
      const r = connect(s.doc, s.id, id, d)
      if ('doc' in r) next = r.doc
    }
  }
  return { doc: next, id }
}

const isInside = (doc: Doc, [c, r]: Cell) =>
  c >= 0 && r >= 0 && c < doc.size[0] && r < doc.size[1]

/**
 * An instrument on whatever was clicked: on a part it measures it, on another
 * instrument it reads that one's signal and joins its loop. It sits on the
 * nearest free cell, the row above first.
 */
export function placeInstrument(
  doc: Doc,
  letters: string,
  on: Cell,
): Result & { index?: number } {
  const part = partAt(doc, on)
  const other = (doc.instruments ?? [])[instrumentAt(doc, on)]
  if (!part && !other) return { error: 'Click the part it measures.' }
  const at = freeCellNear(doc, on)
  if (!at)
    return { error: 'There is no free square near it; make the sheet bigger.' }
  const used = (doc.instruments ?? []).map(
    (i) => Number(splitTag(i.tag).loop) || 0,
  )
  const loop = other
    ? splitTag(other.tag).loop
    : String(Math.max(100, ...used) + 1)
  let tag = `${letters}-${loop}`
  for (let n = 2; (doc.instruments ?? []).some((i) => i.tag === tag); n++)
    tag = `${letters}-${loop}${String.fromCharCode(64 + n)}`
  const inst: InstrumentSpec = {
    tag,
    at,
    measures: part ? part.id : other!.tag,
  }
  if (/^.IC/.test(letters)) inst.mounting = 'dcs'
  // a controller next to a control valve in its loop drives it
  const valve = doc.parts.find(
    (p) =>
      classOf(p, doc) === 'ControlValve' &&
      p.tag &&
      splitTag(p.tag).loop === loop,
  )
  if (letters.endsWith('C') && valve) inst.drives = valve.id
  const next = addInstrument(doc, inst)
  return { doc: next, index: next.instruments!.length - 1 }
}

/** the next line number for a new line on this sheet */
export const nextLineNumber = (doc: Doc) =>
  doc.drawing && doc.drawing !== 'pictorial'
    ? suggestLineNumber(
        doc.drawing,
        doc.links.map((l) => l.tag),
      )
    : undefined

/** the classes a part may be drawn as on this sheet */
export function classesFor(drawing: DrawingType | undefined): string[] {
  const pack = drawing ? PACKS[drawing] : undefined
  return pack ? Object.keys(pack.classes) : []
}
