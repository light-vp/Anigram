// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { isPartKind, PART_KINDS } from '../parts/kinds.ts'
import { ExprError, exprRefs } from '../sim/expr.ts'
import { didYouMean } from '../sim/suggest.ts'
import type {
  Behaviour,
  Caption,
  Expectation,
  Domain,
  EffortSpec,
  EventAction,
  EventSpec,
  InstrumentMounting,
  InstrumentSpec,
  DrawingType,
  Knob,
  LineType,
  LinkSpec,
  PartSpec,
  Scene,
  Signal,
  Switch,
  TitleBlock,
} from '../sim/types.ts'
import { FORMAT_VERSION, migrate } from './migrate.ts'
import { packWarnings } from '../packs/catalogue.ts'
import { physicsWarnings } from './physics.ts'
import { isIsaTag, splitTag } from '../sim/instruments.ts'

/*
 * Checks a scene file — JSON from disk, a share link, or an assistant — and
 * turns it into a Scene the solver and the sheet can trust. Errors stop the
 * scene from loading; warnings are things that will run but probably aren't
 * what the author meant (a part nothing feeds, two parts in one cell).
 *
 * Optional fields are filled in, so a hand-written file can stay short.
 */

export const DOMAINS: readonly Domain[] = [
  'light',
  'electric',
  'water',
  'heat',
  'fuel',
  'mechanical',
  'data',
  'oil',
  'air',
]

export const DRAWINGS: readonly DrawingType[] = [
  'pictorial',
  'pid',
  'single-line',
  'pfd',
  'fluid-power',
]

export const LINE_TYPES: readonly LineType[] = [
  'process',
  'utility',
  'signal',
  'pneumatic',
  'data',
]

export const ROLES: readonly Behaviour['role'][] = [
  'source',
  'sink',
  'bus',
  'gate',
  'converter',
  'storage',
  'vent',
]

/** every field each object in a scene file may have */
export const FIELDS = {
  scene: [
    '$schema',
    'anigram',
    'id',
    'title',
    'subtitle',
    'sheet',
    'drawing',
    'symbols',
    'titleBlock',
    'size',
    'units',
    'scale',
    'parts',
    'links',
    'instruments',
    'knobs',
    'switches',
    'captions',
    'events',
    'expect',
    'clock',
  ],
  clock: ['start', 'rate'],
  titleBlock: [
    'owner',
    'project',
    'drawnBy',
    'checkedBy',
    'approvedBy',
    'issued',
    'revision',
    'status',
  ],
  units: ['rate', 'amount', 'effort'],
  knob: ['id', 'label', 'min', 'max', 'step', 'value', 'format'],
  switch: ['id', 'label', 'on'],
  part: [
    'id',
    'kind',
    'label',
    'at',
    'behaviour',
    'note',
    'labelSide',
    'toggles',
    'tag',
    'class',
    'effort',
  ],
  link: [
    'from',
    'to',
    'domain',
    'capacity',
    'via',
    'bend',
    'loss',
    'line',
    'tag',
    'drop',
  ],
  instrument: [
    'tag',
    'at',
    'measures',
    'reads',
    'unit',
    'drives',
    'signal',
    'mounting',
    'low',
    'high',
  ],
  caption: ['from', 'to', 'text'],
  effort: ['set', 'boost', 'ratio', 'drop', 'min', 'max'],
  relief: ['at', 'full'],
  event: ['id', 'says', 'when', 'after', 'then', 'at', 'once'],
  switchAction: ['switch', 'on'],
  knobAction: ['knob', 'value'],
  expect: ['says', 'check', 'at', 'from', 'to', 'sometime'],
  refill: ['below', 'until'],
  source: ['role', 'output', 'dispatchable', 'merit'],
  sink: ['role', 'demand', 'priority', 'absorbsSurplus'],
  bus: ['role'],
  gate: ['role', 'capacity', 'open', 'relief'],
  converter: ['role', 'output', 'recipe', 'capacity', 'startup'],
  storage: [
    'role',
    'capacity',
    'start',
    'maxIn',
    'maxOut',
    'efficiency',
    'merit',
    'refill',
  ],
  vent: ['role'],
} as const

export const MOUNTINGS: readonly InstrumentMounting[] = [
  'field',
  'panel',
  'behind-panel',
  'dcs',
  'plc',
]

export interface Validation {
  ok: boolean
  /** the normalised scene, when there are no errors */
  scene?: Scene
  errors: string[]
  warnings: string[]
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isCell = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isNum)

export function validateScene(input: unknown): Validation {
  const errors: string[] = []
  const warnings: string[] = []
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`)
  const warn = (path: string, msg: string) => warnings.push(`${path}: ${msg}`)
  /** a field the format doesn't have is ignored, and is usually a typo */
  const unknownFields = (path: string, o: Obj, allowed: readonly string[]) => {
    for (const k of Object.keys(o))
      if (!allowed.includes(k))
        warn(
          path ? `${path}.${k}` : k,
          `is not a field here, so it is ignored${didYouMean(k, allowed)}`,
        )
  }
  const domainError = (path: string, d: string) =>
    err(
      path,
      `unknown domain "${d}"${didYouMean(d, DOMAINS)}; the domains are ${DOMAINS.join(', ')}`,
    )

  if (!isObj(input)) {
    return { ok: false, errors: ['scene: must be a JSON object'], warnings }
  }
  // an older file is upgraded first, so everything below reads one shape
  const m = migrate(input)
  if (m.error) return { ok: false, errors: [m.error], warnings }
  const s = m.scene as Obj
  unknownFields('', s, FIELDS.scene)

  const str = (path: string, v: unknown, fallback?: string): string => {
    if (v === undefined && fallback !== undefined) return fallback
    if (!isStr(v) || (fallback === undefined && !v.trim())) {
      err(path, 'must be a non-empty string')
      return ''
    }
    return v
  }
  const num = (
    path: string,
    v: unknown,
    opts: { fallback?: number; min?: number; max?: number } = {},
  ): number => {
    if (v === undefined && opts.fallback !== undefined) return opts.fallback
    if (!isNum(v)) {
      err(path, 'must be a number')
      return 0
    }
    if (opts.min !== undefined && v < opts.min)
      err(path, `must be at least ${opts.min}`)
    if (opts.max !== undefined && v > opts.max)
      err(path, `must be at most ${opts.max}`)
    return v
  }

  const id = str('id', s.id)
  if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id))
    err('id', 'lowercase letters, digits and dashes only, like "solar-home"')

  let size: [number, number] = [8, 6]
  if (!isCell(s.size) || s.size.some((n) => n < 1 || n > 40 || n % 1)) {
    err('size', 'must be [columns, rows], whole numbers from 1 to 40')
  } else size = s.size

  const units: Scene['units'] = {}
  if (s.units !== undefined) {
    if (!isObj(s.units)) err('units', 'must be an object keyed by domain')
    else
      for (const [d, u] of Object.entries(s.units)) {
        if (!DOMAINS.includes(d as Domain)) domainError(`units.${d}`, d)
        else if (!isObj(u) || !isStr(u.rate) || !isStr(u.amount))
          err(`units.${d}`, 'must be { "rate": "kW", "amount": "kWh" }')
        else {
          unknownFields(`units.${d}`, u, FIELDS.units)
          units[d as Domain] = { rate: u.rate, amount: u.amount }
          if (u.effort !== undefined)
            units[d as Domain]!.effort = str(`units.${d}.effort`, u.effort)
        }
      }
  }

  const scale: Scene['scale'] = {}
  if (s.scale !== undefined) {
    if (!isObj(s.scale)) err('scale', 'must be an object keyed by domain')
    else
      for (const [d, v] of Object.entries(s.scale)) {
        if (!DOMAINS.includes(d as Domain)) domainError(`scale.${d}`, d)
        else scale[d as Domain] = num(`scale.${d}`, v, { min: 1e-9 })
      }
  }

  // controls first, so signals can be checked against them
  const knobs: Knob[] = []
  if (s.knobs !== undefined && !Array.isArray(s.knobs))
    err('knobs', 'must be an array')
  for (const [i, k] of (Array.isArray(s.knobs) ? s.knobs : []).entries()) {
    const p = `knobs[${i}]`
    if (!isObj(k)) {
      err(p, 'must be an object')
      continue
    }
    unknownFields(p, k, FIELDS.knob)
    const knob: Knob = {
      id: str(`${p}.id`, k.id),
      label: str(`${p}.label`, k.label),
      value: num(`${p}.value`, k.value),
    }
    for (const f of ['min', 'max', 'step'] as const)
      if (k[f] !== undefined) knob[f] = num(`${p}.${f}`, k[f])
    if (k.format !== undefined) knob.format = str(`${p}.format`, k.format)
    const lo = knob.min ?? 0
    const hi = knob.max ?? 1
    if (lo >= hi) err(p, 'min must be below max')
    if (knob.value < lo || knob.value > hi)
      err(`${p}.value`, `must be within ${lo}..${hi}`)
    if (knobs.some((o) => o.id === knob.id)) err(`${p}.id`, 'duplicate knob id')
    knobs.push(knob)
  }

  const switches: Switch[] = []
  if (s.switches !== undefined && !Array.isArray(s.switches))
    err('switches', 'must be an array')
  for (const [i, w] of (Array.isArray(s.switches)
    ? s.switches
    : []
  ).entries()) {
    const p = `switches[${i}]`
    if (!isObj(w)) {
      err(p, 'must be an object')
      continue
    }
    unknownFields(p, w, FIELDS.switch)
    const sw: Switch = {
      id: str(`${p}.id`, w.id),
      label: str(`${p}.label`, w.label),
      on: w.on === true,
    }
    if (typeof w.on !== 'boolean') err(`${p}.on`, 'must be true or false')
    if (switches.some((o) => o.id === sw.id))
      err(`${p}.id`, 'duplicate switch id')
    switches.push(sw)
  }

  if (!Array.isArray(s.parts) || !s.parts.length) {
    err('parts', 'must be a non-empty array')
  }
  const rawParts = Array.isArray(s.parts) ? s.parts : []
  const partIds = new Set(
    rawParts
      .filter(isObj)
      .map((p) => p.id)
      .filter(isStr),
  )

  const rawEvents = Array.isArray(s.events) ? s.events : []
  const eventIds = new Set(
    rawEvents
      .filter(isObj)
      .map((e) => e.id)
      .filter(isStr),
  )
  /** fired() and since() name events that exist */
  const checkEvents = (path: string, refs: { events: Set<string> }) => {
    for (const e of refs.events)
      if (!eventIds.has(e))
        err(path, `no event has id "${e}"${didYouMean(e, eventIds)}`)
  }

  /**
   * a signal, read as the tick is solved. With `now`, it is read once the
   * flows are in, so it may read parts as they are with part(): a part's
   * effort, an event's condition.
   */
  const signal = (
    path: string,
    v: unknown,
    fallback?: number,
    now = false,
  ): Signal => {
    if (v === undefined && fallback !== undefined) return fallback
    if (isNum(v)) return v
    if (!isStr(v)) {
      err(path, 'must be a number or an expression string')
      return 0
    }
    try {
      const refs = exprRefs(v)
      checkEvents(path, refs)
      const knobIds = knobs.map((o) => o.id)
      const switchIds = switches.map((o) => o.id)
      for (const k of refs.knobs)
        if (!knobIds.includes(k))
          err(
            path,
            `knob('${k}') — no knob has that id${didYouMean(k, knobIds)}`,
          )
      for (const w of refs.switches)
        if (!switchIds.includes(w))
          err(
            path,
            `on('${w}') — no switch has that id${didYouMean(w, switchIds)}`,
          )
      for (const q of refs.parts)
        if (!partIds.has(q))
          err(
            path,
            `prev('${q}') — no part has that id${didYouMean(q, partIds)}`,
          )
      for (const q of refs.reads)
        if (!now)
          err(
            path,
            `part('${q}') reads a part as it is now, which a flow can't; a signal reads another part with prev('${q}')`,
          )
        else if (!partIds.has(q))
          err(
            path,
            `part('${q}') — no part has that id${didYouMean(q, partIds)}`,
          )
    } catch (e) {
      if (e instanceof ExprError)
        err(path, `${e.message} at character ${e.at + 1} of "${v}"`)
      else throw e
    }
    return v
  }

  /** an expect check reads parts as they are now, with part() */
  const checkExpect = (path: string, v: string) => {
    try {
      const refs = exprRefs(v)
      checkEvents(path, refs)
      for (const k of refs.knobs)
        if (!knobs.some((o) => o.id === k))
          err(path, `knob('${k}') — no knob has that id`)
      for (const w of refs.switches)
        if (!switches.some((o) => o.id === w))
          err(path, `on('${w}') — no switch has that id`)
      for (const q of refs.parts)
        err(
          path,
          `prev('${q}') is for signals; a check reads a part with part('${q}')`,
        )
      for (const q of refs.reads)
        if (!partIds.has(q))
          err(
            path,
            `part('${q}') — no part has that id${didYouMean(q, partIds)}`,
          )
    } catch (e) {
      if (e instanceof ExprError)
        err(path, `${e.message} at character ${e.at + 1} of "${v}"`)
      else throw e
    }
  }

  const parts: PartSpec[] = []
  const seen = new Set<string>()
  for (const [i, raw] of rawParts.entries()) {
    let p = `parts[${i}]`
    if (!isObj(raw)) {
      err(p, 'must be an object')
      continue
    }
    const pid = str(`${p}.id`, raw.id)
    if (pid) p = `parts[${i}] (${pid})`
    unknownFields(p, raw, FIELDS.part)
    if (seen.has(pid)) err(`${p}.id`, 'duplicate part id')
    seen.add(pid)
    const kind = str(`${p}.kind`, raw.kind)
    if (kind && !isPartKind(kind))
      warn(
        `${p}.kind`,
        `"${kind}" has no drawing; it will show as a plain circle${didYouMean(kind, Object.keys(PART_KINDS))}`,
      )
    let at: [number, number] = [0, 0]
    if (!isCell(raw.at)) err(`${p}.at`, 'must be [column, row]')
    else {
      at = raw.at
      if (at[0] < 0 || at[1] < 0 || at[0] > size[0] - 1 || at[1] > size[1] - 1)
        warn(`${p}.at`, `[${at}] is outside the ${size[0]}×${size[1]} grid`)
    }
    const part: PartSpec = {
      id: pid,
      kind,
      label: str(`${p}.label`, raw.label),
      at,
      behaviour: behaviour(`${p}.behaviour`, raw.behaviour),
    }
    if (raw.note !== undefined) part.note = str(`${p}.note`, raw.note)
    if (raw.labelSide !== undefined) {
      if (
        !['below', 'above', 'left', 'right'].includes(raw.labelSide as string)
      )
        err(`${p}.labelSide`, 'must be below, above, left or right')
      else part.labelSide = raw.labelSide as PartSpec['labelSide']
    }
    if (raw.toggles !== undefined) {
      part.toggles = str(`${p}.toggles`, raw.toggles)
      if (!switches.some((w) => w.id === part.toggles))
        err(
          `${p}.toggles`,
          `no switch has id "${part.toggles}"${didYouMean(
            part.toggles,
            switches.map((w) => w.id),
          )}`,
        )
    }
    if (raw.tag !== undefined) {
      part.tag = str(`${p}.tag`, raw.tag)
      const twin = parts.find((q) => q.tag === part.tag)
      if (part.tag && twin)
        err(`${p}.tag`, `${twin.id} already has the tag "${part.tag}"`)
    }
    if (raw.class !== undefined) part.class = str(`${p}.class`, raw.class)
    if (raw.effort !== undefined)
      part.effort = effortSpec(`${p}.effort`, raw.effort, part.behaviour)
    parts.push(part)
  }

  /** what a part sets, adds, loses and is rated for, where its role can */
  function effortSpec(path: string, raw: unknown, b: Behaviour): EffortSpec {
    const out: EffortSpec = {}
    if (!isObj(raw)) {
      err(path, 'must be an object like { "set": 230, "min": 216 }')
      return out
    }
    unknownFields(path, raw, FIELDS.effort)
    const can: Record<Behaviour['role'], readonly string[]> = {
      source: ['set'],
      storage: ['set'],
      converter: ['set', 'boost', 'ratio', 'drop'],
      gate: ['set', 'drop'],
      bus: [],
      sink: [],
      vent: [],
    }
    const why: Record<string, string> = {
      set: 'only a source, store, converter or gate (a regulator) sets an effort',
      boost: 'only a converter adds to the effort it is given, like a pump',
      ratio:
        'only a converter multiplies the effort it is given, like a transformer',
      drop: 'only a gate or a converter loses effort through itself; give its link a drop instead',
    }
    for (const f of ['set', 'boost', 'ratio', 'drop'] as const)
      if (raw[f] !== undefined && !can[b.role].includes(f))
        err(`${path}.${f}`, `${why[f]}, and this is a ${b.role}`)
    if (raw.set !== undefined)
      out.set = signal(`${path}.set`, raw.set, undefined, true)
    if (raw.boost !== undefined)
      out.boost = signal(`${path}.boost`, raw.boost, undefined, true)
    if (raw.ratio !== undefined) {
      out.ratio = num(`${path}.ratio`, raw.ratio, { min: 0 })
      if (raw.set !== undefined)
        err(
          path,
          'give set or ratio, not both: one fixes the outlet, the other follows the inlet',
        )
    }
    if (raw.drop !== undefined) {
      out.drop = num(`${path}.drop`, raw.drop, { min: 0 })
      if (b.role === 'converter' && b.capacity === undefined)
        err(
          `${path}.drop`,
          'a drop is what is lost at full capacity, so the converter needs a capacity',
        )
    }
    if (raw.min !== undefined) out.min = num(`${path}.min`, raw.min)
    if (raw.max !== undefined) out.max = num(`${path}.max`, raw.max)
    if (out.min !== undefined && out.max !== undefined && out.min >= out.max)
      err(path, 'min must be below max')
    return out
  }

  function behaviour(path: string, b: unknown): Behaviour {
    if (!isObj(b) || !ROLES.includes(b.role as Behaviour['role'])) {
      const role = isObj(b) && isStr(b.role) ? b.role : ''
      err(
        `${path}.role`,
        `must be one of ${ROLES.join(', ')}${didYouMean(role, ROLES)}`,
      )
      return { role: 'vent' }
    }
    unknownFields(path, b, FIELDS[b.role as Behaviour['role']])
    const opt = (k: string, min = 0) =>
      b[k] === undefined ? undefined : num(`${path}.${k}`, b[k], { min })
    const keep = <T extends object>(o: T) =>
      Object.fromEntries(
        Object.entries(o).filter(([, v]) => v !== undefined),
      ) as T
    switch (b.role) {
      case 'source':
        return keep({
          role: 'source',
          output: signal(`${path}.output`, b.output),
          dispatchable: b.dispatchable === true ? true : undefined,
          merit: opt('merit'),
        })
      case 'sink':
        return keep({
          role: 'sink',
          demand: signal(`${path}.demand`, b.demand),
          priority:
            b.priority === undefined
              ? undefined
              : num(`${path}.priority`, b.priority),
          absorbsSurplus: b.absorbsSurplus === true ? true : undefined,
        })
      case 'bus':
        return { role: 'bus' }
      case 'vent':
        return { role: 'vent' }
      case 'gate': {
        let relief: { at: number; full?: number } | undefined
        if (b.relief !== undefined) {
          const r = b.relief
          if (!isObj(r)) err(`${path}.relief`, 'must be { at, full }')
          else {
            unknownFields(`${path}.relief`, r, FIELDS.relief)
            relief = { at: num(`${path}.relief.at`, r.at, { min: 0 }) }
            if (r.full !== undefined) {
              relief.full = num(`${path}.relief.full`, r.full)
              if (relief.full <= relief.at)
                err(
                  `${path}.relief`,
                  'full must be above at: it lifts at one, is wide open at the other',
                )
            }
          }
        }
        return keep({
          role: 'gate',
          capacity: num(`${path}.capacity`, b.capacity, { min: 0 }),
          open:
            b.open === undefined ? undefined : signal(`${path}.open`, b.open),
          relief,
        })
      }
      case 'converter': {
        const output = b.output as Domain
        if (!DOMAINS.includes(output))
          domainError(`${path}.output`, String(output))
        const recipe: Partial<Record<Domain, number>> = {}
        if (!isObj(b.recipe) || !Object.keys(b.recipe).length)
          err(
            `${path}.recipe`,
            'must say what one unit of output takes, like { "fuel": 2.2 }',
          )
        else
          for (const [d, v] of Object.entries(b.recipe)) {
            if (!DOMAINS.includes(d as Domain))
              domainError(`${path}.recipe.${d}`, d)
            else {
              recipe[d as Domain] = num(`${path}.recipe.${d}`, v)
              if (isNum(v) && v <= 0)
                err(
                  `${path}.recipe.${d}`,
                  'must be more than 0: it is how much one unit of output takes',
                )
            }
          }
        return keep({
          role: 'converter',
          output,
          recipe,
          capacity: opt('capacity'),
          startup: opt('startup'),
        })
      }
      case 'storage': {
        let refill: { below: number; until: number } | undefined
        if (b.refill !== undefined) {
          const r = b.refill
          if (!isObj(r)) err(`${path}.refill`, 'must be { below, until }')
          else {
            unknownFields(`${path}.refill`, r, FIELDS.refill)
            refill = {
              below: num(`${path}.refill.below`, r.below, { min: 0, max: 1 }),
              until: num(`${path}.refill.until`, r.until, { min: 0, max: 1 }),
            }
            if (refill.below >= refill.until)
              err(`${path}.refill`, 'below must be lower than until')
          }
        }
        return keep({
          role: 'storage',
          capacity: num(`${path}.capacity`, b.capacity, { min: 1e-9 }),
          start:
            b.start === undefined
              ? undefined
              : num(`${path}.start`, b.start, { min: 0, max: 1 }),
          maxIn: signal(`${path}.maxIn`, b.maxIn),
          maxOut: signal(`${path}.maxOut`, b.maxOut),
          efficiency:
            b.efficiency === undefined
              ? undefined
              : num(`${path}.efficiency`, b.efficiency, { min: 0, max: 1 }),
          merit: opt('merit'),
          refill,
        })
      }
    }
    return { role: 'vent' }
  }

  // two parts in one cell draw on top of each other
  const cells = new Map<string, string>()
  for (const p of parts) {
    const key = p.at.join(',')
    const other = cells.get(key)
    if (other) warn(`parts (${p.id})`, `sits in the same cell as ${other}`)
    else cells.set(key, p.id)
  }

  const links: LinkSpec[] = []
  if (!Array.isArray(s.links)) err('links', 'must be an array')
  for (const [i, raw] of (Array.isArray(s.links) ? s.links : []).entries()) {
    let p = `links[${i}]`
    if (!isObj(raw)) {
      err(p, 'must be an object')
      continue
    }
    const link: LinkSpec = {
      from: str(`${p}.from`, raw.from),
      to: str(`${p}.to`, raw.to),
      domain: raw.domain as Domain,
    }
    p = `links[${i}] (${link.from} → ${link.to})`
    unknownFields(p, raw, FIELDS.link)
    if (link.from && !partIds.has(link.from))
      err(`${p}.from`, `no part has that id${didYouMean(link.from, partIds)}`)
    if (link.to && !partIds.has(link.to))
      err(`${p}.to`, `no part has that id${didYouMean(link.to, partIds)}`)
    if (link.from && link.from === link.to)
      err(p, 'a link cannot loop to itself')
    if (!DOMAINS.includes(link.domain))
      domainError(`${p}.domain`, String(link.domain))
    if (raw.capacity !== undefined)
      link.capacity = num(`${p}.capacity`, raw.capacity, { min: 0 })
    if (raw.via !== undefined) {
      if (!Array.isArray(raw.via) || !raw.via.every(isCell))
        err(`${p}.via`, 'must be a list of [column, row] waypoints')
      else link.via = raw.via
    }
    if (raw.bend !== undefined) {
      if (raw.bend !== 'hv' && raw.bend !== 'vh')
        err(`${p}.bend`, 'must be "hv" or "vh"')
      else link.bend = raw.bend
    }
    if (raw.loss !== undefined) {
      link.loss = raw.loss === true
      const from = parts.find((q) => q.id === link.from)
      if (link.loss && from && from.behaviour.role !== 'converter')
        err(`${p}.loss`, 'only a converter has losses to send')
      if (link.loss && link.capacity !== undefined)
        err(
          `${p}.capacity`,
          'a loss link carries whatever its converter loses, so it has no capacity',
        )
    }
    if (
      DOMAINS.includes(link.domain) &&
      units[link.domain] === undefined &&
      !warnings.some((w) => w.startsWith(`units.${link.domain}`))
    )
      warn(
        `units.${link.domain}`,
        'links carry this domain but it has no units',
      )
    if (raw.line !== undefined) {
      if (!LINE_TYPES.includes(raw.line as LineType))
        err(
          `${p}.line`,
          `unknown line type "${String(raw.line)}"${didYouMean(String(raw.line), LINE_TYPES)}; the line types are ${LINE_TYPES.join(', ')}`,
        )
      else link.line = raw.line as LineType
    }
    if (raw.tag !== undefined) link.tag = str(`${p}.tag`, raw.tag)
    if (raw.drop !== undefined) {
      link.drop = num(`${p}.drop`, raw.drop, { min: 0 })
      if (link.capacity === undefined || link.loss)
        err(
          `${p}.drop`,
          'a drop is what the link loses when it carries its capacity, so it needs a capacity',
        )
    }
    const twin = links.findIndex(
      (o) =>
        o.from === link.from &&
        o.to === link.to &&
        o.domain === link.domain &&
        !!o.loss === !!link.loss,
    )
    if (twin >= 0)
      err(
        p,
        `repeats links[${twin}]; one link per pair and domain carries all the flow`,
      )
    links.push(link)
  }

  // the network makes sense: things that consume are fed, things that make are used
  for (const p of parts) {
    const ins = links.filter((l) => l.to === p.id)
    const outs = links.filter((l) => l.from === p.id)
    const b = p.behaviour
    const where = `parts (${p.id})`
    if ((b.role === 'sink' || b.role === 'vent') && !ins.length)
      warn(where, `is a ${b.role} but nothing links into it`)
    if (b.role === 'source' && !outs.length)
      warn(where, 'is a source but links to nothing')
    if (
      (b.role === 'bus' || b.role === 'gate') &&
      (!ins.length || !outs.length)
    )
      warn(where, `is a ${b.role}; it needs links both in and out`)
    if (b.role === 'converter') {
      for (const d of Object.keys(b.recipe) as Domain[])
        if (!ins.some((l) => l.domain === d && !l.loss))
          warn(where, `its recipe needs ${d} but no ${d} link comes in`)
      if (!outs.some((l) => !l.loss && l.domain === b.output))
        warn(where, `makes ${b.output} but no ${b.output} link leaves it`)
    }
  }

  const instruments: InstrumentSpec[] = []
  if (s.instruments !== undefined && !Array.isArray(s.instruments))
    err('instruments', 'must be an array')
  const partTags = new Map(
    parts.filter((q) => q.tag).map((q) => [q.tag!, q.id]),
  )
  const instrumentTags = new Set(
    (Array.isArray(s.instruments) ? s.instruments : [])
      .filter(isObj)
      .map((x) => x.tag)
      .filter(isStr),
  )
  const partRef = (path: string, v: unknown): string => {
    const ref = str(path, v)
    if (ref && !partIds.has(ref))
      err(path, `no part has id "${ref}"${didYouMean(ref, partIds)}`)
    return ref
  }
  for (const [i, x] of (Array.isArray(s.instruments)
    ? s.instruments
    : []
  ).entries()) {
    let p = `instruments[${i}]`
    if (!isObj(x)) {
      err(p, 'must be an object')
      continue
    }
    const tag = str(`${p}.tag`, x.tag)
    if (tag) p = `instruments[${i}] (${tag})`
    unknownFields(p, x, FIELDS.instrument)
    if (tag && !isIsaTag(tag))
      warn(
        `${p}.tag`,
        'an ISA-5.1 tag is letters then a loop number, like "LIC-101": the first letter is what it measures, the rest what it does',
      )
    if (partTags.has(tag))
      err(`${p}.tag`, `${partTags.get(tag)} already has the tag "${tag}"`)
    if (instruments.some((o) => o.tag === tag))
      err(`${p}.tag`, `another instrument already has the tag "${tag}"`)
    let at: [number, number] = [0, 0]
    if (!isCell(x.at)) err(`${p}.at`, 'must be [column, row]')
    else {
      at = x.at
      if (at[0] < 0 || at[1] < 0 || at[0] > size[0] - 1 || at[1] > size[1] - 1)
        warn(`${p}.at`, `[${at}] is outside the ${size[0]}×${size[1]} grid`)
    }
    // it measures a part, or takes its signal from another instrument
    const measures = str(`${p}.measures`, x.measures)
    if (measures && !partIds.has(measures) && !instrumentTags.has(measures))
      err(
        `${p}.measures`,
        `no part or instrument is "${measures}"${didYouMean(measures, [...partIds, ...instrumentTags])}`,
      )
    if (measures === tag)
      err(`${p}.measures`, 'an instrument cannot measure itself')
    const inst: InstrumentSpec = { tag, at, measures }
    if (x.reads !== undefined) {
      inst.reads = str(`${p}.reads`, x.reads)
      // a reading is of the parts as they are now, like an expect check, but prev() works too
      try {
        const refs = exprRefs(inst.reads)
        checkEvents(`${p}.reads`, refs)
        for (const k of refs.knobs)
          if (!knobs.some((o) => o.id === k))
            err(`${p}.reads`, `knob('${k}') — no knob has that id`)
        for (const w of refs.switches)
          if (!switches.some((o) => o.id === w))
            err(`${p}.reads`, `on('${w}') — no switch has that id`)
        for (const q of [...refs.parts, ...refs.reads])
          if (!partIds.has(q))
            err(
              `${p}.reads`,
              `part('${q}') — no part has that id${didYouMean(q, partIds)}`,
            )
      } catch (e) {
        if (e instanceof ExprError)
          err(
            `${p}.reads`,
            `${e.message} at character ${e.at + 1} of "${inst.reads}"`,
          )
        else throw e
      }
    }
    if (x.unit !== undefined) inst.unit = str(`${p}.unit`, x.unit, '')
    if (x.drives !== undefined) inst.drives = partRef(`${p}.drives`, x.drives)
    if (x.signal !== undefined) {
      if (!['signal', 'pneumatic', 'data'].includes(x.signal as string))
        err(`${p}.signal`, 'must be signal, pneumatic or data')
      else inst.signal = x.signal as InstrumentSpec['signal']
    }
    if (x.mounting !== undefined) {
      if (!MOUNTINGS.includes(x.mounting as InstrumentMounting))
        err(
          `${p}.mounting`,
          `must be ${MOUNTINGS.join(', ')}${didYouMean(String(x.mounting), MOUNTINGS)}`,
        )
      else inst.mounting = x.mounting as InstrumentMounting
    }
    if (x.low !== undefined) inst.low = num(`${p}.low`, x.low)
    if (x.high !== undefined) inst.high = num(`${p}.high`, x.high)
    if (
      inst.low !== undefined &&
      inst.high !== undefined &&
      inst.low >= inst.high
    )
      err(p, 'low must be below high')

    // what the tag says against what the instrument is wired to
    const { letters } = splitTag(tag)
    const measured = parts.find((q) => q.id === inst.measures)
    const driven = parts.find((q) => q.id === inst.drives)
    if (letters.slice(1).includes('C') && !inst.drives)
      warn(
        p,
        `${tag} is a controller, so it should drive something: give it "drives", the valve or breaker it works`,
      )
    if (driven && driven.behaviour.role !== 'gate')
      warn(
        `${p}.drives`,
        `${driven.id} is a ${driven.behaviour.role}; a controller drives a gate, a valve or breaker whose "open" follows it`,
      )
    if (
      letters[0] === 'L' &&
      inst.reads === undefined &&
      measured &&
      measured.behaviour.role !== 'storage'
    )
      warn(
        p,
        `a level instrument reads a store's fill, but ${measured.id} is a ${measured.behaviour.role}; give it "reads"`,
      )
    instruments.push(inst)
  }

  const captions: Caption[] = []
  if (s.captions !== undefined && !Array.isArray(s.captions))
    err('captions', 'must be an array')
  for (const [i, c] of (Array.isArray(s.captions)
    ? s.captions
    : []
  ).entries()) {
    const p = `captions[${i}]`
    if (!isObj(c)) {
      err(p, 'must be an object')
      continue
    }
    unknownFields(p, c, FIELDS.caption)
    captions.push({
      from: num(`${p}.from`, c.from, { min: 0, max: 24 }),
      to: num(`${p}.to`, c.to, { min: 0, max: 24 }),
      text: str(`${p}.text`, c.text),
    })
  }

  const events: EventSpec[] = []
  if (s.events !== undefined && !Array.isArray(s.events))
    err('events', 'must be an array')
  for (const [i, x] of rawEvents.entries()) {
    let p = `events[${i}]`
    if (!isObj(x)) {
      err(p, 'must be an object')
      continue
    }
    const eid = str(`${p}.id`, x.id)
    if (eid) p = `events[${i}] (${eid})`
    unknownFields(p, x, FIELDS.event)
    if (events.some((o) => o.id === eid)) err(`${p}.id`, 'duplicate event id')
    const ev: EventSpec = {
      id: eid,
      says: str(`${p}.says`, x.says),
      when: str(`${p}.when`, x.when),
      then: [],
    }
    // the condition reads the parts as they are now, like an expect check
    if (ev.when) signal(`${p}.when`, ev.when, undefined, true)
    if (x.after !== undefined) ev.after = num(`${p}.after`, x.after, { min: 0 })
    if (x.at !== undefined) ev.at = partRef(`${p}.at`, x.at)
    if (x.once !== undefined) {
      if (typeof x.once !== 'boolean') err(`${p}.once`, 'must be true or false')
      else if (x.once) ev.once = true
    }
    if (!Array.isArray(x.then) || !x.then.length)
      err(
        `${p}.then`,
        'must list what it does, like [{ "switch": "pump", "on": true }]',
      )
    for (const [j, a] of (Array.isArray(x.then) ? x.then : []).entries()) {
      const q = `${p}.then[${j}]`
      if (!isObj(a)) {
        err(q, 'must be an object')
        continue
      }
      let act: EventAction | undefined
      if (a.switch !== undefined && a.knob === undefined) {
        unknownFields(q, a, FIELDS.switchAction)
        const id = str(`${q}.switch`, a.switch)
        if (!switches.some((w) => w.id === id))
          err(
            `${q}.switch`,
            `no switch has id "${id}"${didYouMean(
              id,
              switches.map((w) => w.id),
            )}`,
          )
        if (typeof a.on !== 'boolean') err(`${q}.on`, 'must be true or false')
        act = { switch: id, on: a.on === true }
      } else if (a.knob !== undefined && a.switch === undefined) {
        unknownFields(q, a, FIELDS.knobAction)
        const id = str(`${q}.knob`, a.knob)
        const knob = knobs.find((k) => k.id === id)
        const value = num(`${q}.value`, a.value)
        if (!knob)
          err(
            `${q}.knob`,
            `no knob has id "${id}"${didYouMean(
              id,
              knobs.map((k) => k.id),
            )}`,
          )
        else if (value < (knob.min ?? 0) || value > (knob.max ?? 1))
          err(`${q}.value`, `must be within ${knob.min ?? 0}..${knob.max ?? 1}`)
        act = { knob: id, value }
      } else
        err(
          q,
          'must be { "switch": "id", "on": true } or { "knob": "id", "value": 0.5 }',
        )
      if (act) ev.then.push(act)
    }
    events.push(ev)
  }

  const expect: Expectation[] = []
  if (s.expect !== undefined && !Array.isArray(s.expect))
    err('expect', 'must be an array')
  for (const [i, x] of (Array.isArray(s.expect) ? s.expect : []).entries()) {
    const p = `expect[${i}]`
    if (!isObj(x)) {
      err(p, 'must be an object')
      continue
    }
    unknownFields(p, x, FIELDS.expect)
    const e: Expectation = {
      says: str(`${p}.says`, x.says),
      check: str(`${p}.check`, x.check),
    }
    if (e.check) checkExpect(`${p}.check`, e.check)
    // checks run on the simulated day's whole hours
    const hour = (f: 'at' | 'from' | 'to') => {
      const v = num(`${p}.${f}`, x[f], { min: 0, max: 24 })
      if (v % 1) err(`${p}.${f}`, 'checks run on the hour, so use a whole hour')
      return v
    }
    if (x.at !== undefined) e.at = hour('at')
    if (x.from !== undefined) e.from = hour('from')
    if (x.to !== undefined) e.to = hour('to')
    if ((e.from === undefined) !== (e.to === undefined))
      err(p, 'give both from and to, or neither')
    if (e.at !== undefined && e.from !== undefined)
      err(p, 'give at, or from and to, not both')
    if (x.sometime !== undefined) {
      if (typeof x.sometime !== 'boolean')
        err(`${p}.sometime`, 'must be true or false')
      else if (x.sometime) e.sometime = true
    }
    expect.push(e)
  }

  const clock = isObj(s.clock) ? s.clock : {}
  unknownFields('clock', clock, FIELDS.clock)
  if (s.clock !== undefined && !isObj(s.clock))
    err('clock', 'must be { "start": 6, "rate": 1 }')

  const scene: Scene = {
    anigram: FORMAT_VERSION,
    id,
    title: str('title', s.title),
    subtitle: str('subtitle', s.subtitle, ''),
    sheet: str('sheet', s.sheet, 'LD-100'),
    size,
    units,
    scale,
    parts,
    links,
    clock: {
      start: num('clock.start', clock.start, { fallback: 6, min: 0, max: 24 }),
      rate: num('clock.rate', clock.rate, { fallback: 1, min: 0.01, max: 24 }),
    },
  }
  if (s.drawing !== undefined) {
    if (!DRAWINGS.includes(s.drawing as DrawingType))
      err(
        'drawing',
        `unknown drawing type "${String(s.drawing)}"${didYouMean(String(s.drawing), DRAWINGS)}; the types are ${DRAWINGS.join(', ')}`,
      )
    else if (s.drawing !== 'pictorial') scene.drawing = s.drawing as DrawingType
  }
  if (s.symbols !== undefined) {
    if (s.symbols !== 'iec' && s.symbols !== 'ansi')
      err('symbols', 'must be "iec" or "ansi"')
    else if (scene.drawing !== 'single-line')
      warn('symbols', 'only a single-line drawing chooses its symbol standard')
    else scene.symbols = s.symbols
  }
  if (s.titleBlock !== undefined) {
    if (!isObj(s.titleBlock)) err('titleBlock', 'must be an object')
    else {
      unknownFields('titleBlock', s.titleBlock, FIELDS.titleBlock)
      const tb: TitleBlock = {}
      for (const f of FIELDS.titleBlock)
        if (s.titleBlock[f] !== undefined)
          tb[f] = str(`titleBlock.${f}`, s.titleBlock[f])
      if (tb.issued && !/^\d{4}-\d{2}-\d{2}$/.test(tb.issued))
        err('titleBlock.issued', 'must be a date like "2026-10-11"')
      if (Object.keys(tb).length) scene.titleBlock = tb
    }
  }
  if (instruments.length) {
    scene.instruments = instruments
    if (scene.drawing !== 'pid')
      warn(
        'instruments',
        'instruments are drawn only on a P&ID ("drawing": "pid")',
      )
  }
  if (knobs.length) scene.knobs = knobs
  if (switches.length) scene.switches = switches
  if (captions.length) scene.captions = captions
  if (events.length) scene.events = events
  if (expect.length) scene.expect = expect

  if (errors.length) return { ok: false, errors, warnings }
  warnings.push(...physicsWarnings(scene), ...packWarnings(scene))
  return { ok: true, scene, errors, warnings }
}
