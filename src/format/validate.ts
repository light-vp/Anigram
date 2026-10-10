// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { isPartKind, PART_KINDS } from '../parts/kinds.ts'
import { ExprError, exprRefs } from '../sim/expr.ts'
import { didYouMean } from '../sim/suggest.ts'
import type {
  Behaviour,
  Caption,
  Domain,
  Knob,
  LinkSpec,
  PartSpec,
  Scene,
  Signal,
  Switch,
} from '../sim/types.ts'
import { FORMAT_VERSION, migrate } from './migrate.ts'

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
const FIELDS = {
  scene: [
    '$schema',
    'anigram',
    'id',
    'title',
    'subtitle',
    'sheet',
    'size',
    'units',
    'scale',
    'parts',
    'links',
    'knobs',
    'switches',
    'captions',
    'clock',
  ],
  clock: ['start', 'rate'],
  units: ['rate', 'amount'],
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
  ],
  link: ['from', 'to', 'domain', 'capacity', 'via', 'bend', 'loss'],
  caption: ['from', 'to', 'text'],
  refill: ['below', 'until'],
  source: ['role', 'output', 'dispatchable', 'merit'],
  sink: ['role', 'demand', 'priority', 'absorbsSurplus'],
  bus: ['role'],
  gate: ['role', 'capacity', 'open'],
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

  const signal = (path: string, v: unknown, fallback?: number): Signal => {
    if (v === undefined && fallback !== undefined) return fallback
    if (isNum(v)) return v
    if (!isStr(v)) {
      err(path, 'must be a number or an expression string')
      return 0
    }
    try {
      const refs = exprRefs(v)
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
    } catch (e) {
      if (e instanceof ExprError)
        err(path, `${e.message} at character ${e.at + 1} of "${v}"`)
      else throw e
    }
    return v
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
    parts.push(part)
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
      case 'gate':
        return keep({
          role: 'gate',
          capacity: num(`${path}.capacity`, b.capacity, { min: 0 }),
          open:
            b.open === undefined ? undefined : signal(`${path}.open`, b.open),
        })
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
  if (knobs.length) scene.knobs = knobs
  if (switches.length) scene.switches = switches
  if (captions.length) scene.captions = captions

  return errors.length
    ? { ok: false, errors, warnings }
    : { ok: true, scene, errors, warnings }
}
