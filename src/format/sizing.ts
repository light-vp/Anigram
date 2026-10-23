// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { effortUnit } from '../sim/effort.ts'
import { ENERGY_DOMAINS } from '../sim/types.ts'
import type {
  Behaviour,
  Domain,
  PartSpec,
  Requirement,
  Scene,
  Signal,
} from '../sim/types.ts'
import { num } from '../view/format.ts'
import { simulateDay } from './report.ts'
import type { Controls } from './report.ts'
import { checkRequirements } from './requires.ts'

/*
 * When a requirement fails, how big would things have to be? The search
 * treats the simulation as the judge: it scales one sizing value at a time
 * (a pump's capacity, a source's output, a tank's size, a pump's head),
 * re-runs the day, and closes in on the smallest change that makes every
 * requirement hold. When no one value can do it, as when a bigger pump only
 * fills a tank that can't take it in any faster, it scales the whole supply
 * path together and then gives back every change that wasn't needed.
 *
 * It assumes bigger is better along the way (more supply never starves a
 * demand), which holds for flows; it re-checks every answer it gives, so an
 * answer is never wrong, only sometimes missing.
 */

/** a sizing value the search may change */
export interface Lever {
  part: string
  /** a link, when the value is a link's capacity */
  link?: number
  field: 'output' | 'capacity' | 'maxIn' | 'maxOut' | 'boost' | 'set'
  /** what it is, in words: "Feed pump capacity" */
  label: string
  /** today's value, or null when it is an expression */
  value: number | null
  unit: string
}

export interface SizingChange extends Lever {
  /** how much it is scaled by */
  factor: number
  /** the new value, or null for an expression (scaled by `factor`) */
  to: number | null
  /** the change in words: "Feed pump capacity 100 → 140 m³/h" */
  text: string
}

export interface SizingOption {
  changes: SizingChange[]
  /** what the changed parts then take in: "Feed pump takes up to 35 kW of electric" */
  needs: string[]
  /** the scene with the changes made */
  scene: Scene
}

export interface Sizing {
  /** the requirements that failed before any change */
  failing: string[]
  /** ways to make every requirement hold, the smallest change first */
  options: SizingOption[]
  /**
   * when nothing makes them hold together: what each failing one would take
   * on its own, and which others that change would then break
   */
  alone: Array<{ says: string; options: SizingOption[]; breaks: string[][] }>
  /** days simulated */
  runs: number
  /** stopped at the run budget before trying everything */
  partial: boolean
}

export interface SizingOptions {
  controls?: Controls
  /** most days to simulate; each takes tens of milliseconds */
  budget?: number
  /** and most milliseconds to spend */
  timeLimit?: number
}

/** how far a value may be scaled: ten times up, or down to a tenth */
const UP = 10
const DOWN = 0.1
/** bisection steps on a log scale: 1.3% at worst between 1× and 10× */
const STEPS = 7
/** steps when giving a value back, in a search over several */
const SHRINK_STEPS = 5
/** levers per search, nearest to the requirement first */
const MAX_LEVERS = 8
const BUDGET = 240
const TIME_LIMIT = 30_000

const FIELD_NAMES: Record<Lever['field'], string> = {
  output: 'output',
  capacity: 'capacity',
  maxIn: 'fill rate',
  maxOut: 'draw-off rate',
  boost: 'head',
  set: 'set point',
}

const rateUnit = (scene: Scene, d: Domain | undefined) =>
  (d && scene.units[d]?.rate) ?? ''

function linkDomain(scene: Scene, part: PartSpec, side: 'in' | 'out') {
  const l =
    side === 'in'
      ? scene.links.find((x) => x.to === part.id && !x.loss)
      : scene.links.find((x) => x.from === part.id && !x.loss)
  return l?.domain
}

/** the parts a part's flow comes through, nearest first, the part itself included */
function upstream(scene: Scene, id: string): string[] {
  const seen = [id]
  for (let i = 0; i < seen.length; i++)
    for (const l of scene.links)
      if (l.to === seen[i] && !l.loss && !seen.includes(l.from))
        seen.push(l.from)
  return seen
}

/** the sizing values that could make a requirement hold */
export function leversFor(scene: Scene, r: Requirement): Lever[] {
  const out: Lever[] = []
  const effort = r.reads === 'effort'
  for (const id of upstream(scene, r.part)) {
    const p = scene.parts.find((x) => x.id === id)
    if (!p) continue
    const b = p.behaviour
    const add = (
      field: Lever['field'],
      v: Signal | undefined,
      unit: string,
    ) => {
      if (v === undefined || typeof v === 'function') return
      out.push({
        part: id,
        field,
        label: `${p.label} ${FIELD_NAMES[field]}`,
        value: typeof v === 'number' ? v : null,
        unit,
      })
    }
    if (effort) {
      const unit = effortUnit(scene, id)
      add('boost', p.effort?.boost, unit)
      add('set', p.effort?.set, unit)
      continue
    }
    if (b.role === 'sink') continue
    const flow = rateUnit(scene, linkDomain(scene, p, 'out'))
    if (b.role === 'source') add('output', b.output, flow)
    if (b.role === 'gate') add('capacity', b.capacity, flow)
    if (b.role === 'converter')
      add('capacity', b.capacity, rateUnit(scene, b.output))
    if (b.role === 'storage') {
      const amount =
        scene.units[linkDomain(scene, p, 'in') ?? linkDomain(scene, p, 'out')!]
          ?.amount ?? ''
      add('capacity', b.capacity, amount)
      add('maxIn', b.maxIn, flow)
      add('maxOut', b.maxOut, flow)
    }
  }
  // a link with a limit of its own, into anything upstream
  if (!effort) {
    const ups = new Set(upstream(scene, r.part))
    scene.links.forEach((l, i) => {
      if (l.capacity === undefined || l.loss || !ups.has(l.to)) return
      const from = scene.parts.find((p) => p.id === l.from)?.label ?? l.from
      const to = scene.parts.find((p) => p.id === l.to)?.label ?? l.to
      out.push({
        part: l.to,
        link: i,
        field: 'capacity',
        label: `Line from ${from} to ${to.charAt(0).toLowerCase()}${to.slice(1)}`,
        value: l.capacity,
        unit: rateUnit(scene, l.domain),
      })
    })
  }
  return out.slice(0, MAX_LEVERS)
}

const sameLever = (a: Lever, b: Lever) =>
  a.part === b.part && a.link === b.link && a.field === b.field

const scaleSignal = (v: Signal, k: number): Signal =>
  typeof v === 'number'
    ? v * k
    : typeof v === 'string'
      ? `${round(k, 3)} * (${v})`
      : (env) => k * v(env)

/** a lever's new value as written in the file */
export function scaledValue(l: Lever, current: Signal, k: number): Signal {
  return typeof current === 'number' && l.value !== null
    ? round(current * k, 6)
    : scaleSignal(current, k)
}

/** the scene with each lever scaled by its factor */
export function applyLevers(
  scene: Scene,
  changes: Array<{ lever: Lever; k: number }>,
): Scene {
  const parts = scene.parts.map((p) => {
    const mine = changes.filter(
      (c) => c.lever.part === p.id && c.lever.link === undefined,
    )
    if (!mine.length) return p
    let behaviour = p.behaviour
    let effort = p.effort
    for (const { lever, k } of mine) {
      if (lever.field === 'boost' || lever.field === 'set') {
        const v = effort?.[lever.field]
        if (v !== undefined)
          effort = { ...effort, [lever.field]: scaledValue(lever, v, k) }
      } else {
        const v = (behaviour as Record<string, unknown>)[lever.field] as
          Signal | undefined
        if (v !== undefined)
          behaviour = {
            ...behaviour,
            [lever.field]: scaledValue(lever, v, k),
          } as Behaviour
      }
    }
    return { ...p, behaviour, ...(effort ? { effort } : {}) }
  })
  const links = scene.links.map((l, i) => {
    const c = changes.find((x) => x.lever.link === i)
    return c && l.capacity !== undefined
      ? { ...l, capacity: round(l.capacity * c.k, 6) }
      : l
  })
  return { ...scene, parts, links }
}

const round = (v: number, sig: number) => Number(v.toPrecision(sig))

/** round away from the starting value, to two significant figures */
function nice(v: number, up: boolean): number {
  if (v === 0) return 0
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 1)
  return (up ? Math.ceil(v / mag - 1e-9) : Math.floor(v / mag + 1e-9)) * mag
}

/** the factor written the way the new value reads: 1.4×, not 1.3741× */
function niceFactor(l: Lever, k: number): number {
  if (l.value !== null && l.value !== 0) {
    const to = nice(l.value * k, k > 1)
    return to / l.value
  }
  return k > 1 ? Math.ceil(k * 20 - 1e-9) / 20 : Math.floor(k * 20 + 1e-9) / 20
}

function changeOf(l: Lever, k: number): SizingChange {
  const to = l.value === null ? null : round(l.value * k, 6)
  const pct = Math.round((k - 1) * 100)
  const text =
    to === null
      ? `${l.label} ${round(k, 3)}× (${pct > 0 ? '+' : ''}${pct}%)`
      : `${l.label} ${num(l.value!)} → ${num(to)}${l.unit ? ` ${l.unit}` : ''} (${pct > 0 ? '+' : ''}${pct}%)`
  return { ...l, factor: round(k, 6), to, text }
}

/** what a resized converter then takes in, of each kind of energy */
function needsOf(scene: Scene, changes: SizingChange[]): string[] {
  const out: string[] = []
  for (const c of changes) {
    const p = scene.parts.find((x) => x.id === c.part)
    const b = p?.behaviour
    if (!p || c.link !== undefined || b?.role !== 'converter') continue
    if (c.field !== 'capacity' || c.to === null) continue
    for (const [d, per] of Object.entries(b.recipe) as Array<
      [Domain, number]
    >) {
      if (d === b.output || !ENERGY_DOMAINS.has(d) || !per) continue
      const unit = rateUnit(scene, d)
      out.push(
        `${p.label} takes up to ${num(c.to * per)}${unit ? ` ${unit}` : ''} of ${d === 'electric' ? 'electric power' : d} at that size (now ${num(c.value! * per)}${unit ? ` ${unit}` : ''})`,
      )
    }
  }
  return out
}

/**
 * Find how a scene must change for its requirements to hold. A generator,
 * so the editor can run it a day at a time without freezing; `sizeScene`
 * runs it to the end.
 */
export function* sizing(
  scene: Scene,
  opts: SizingOptions = {},
): Generator<{ runs: number }, Sizing> {
  const budget = opts.budget ?? BUDGET
  const deadline = Date.now() + (opts.timeLimit ?? TIME_LIMIT)
  let runs = 0
  const more = () => runs < budget && Date.now() <= deadline
  const results = (s: Scene) => {
    runs++
    return checkRequirements(s, simulateDay(s, opts.controls))
  }
  const before = results(scene)
  const failing = before.filter((r) => !r.ok)
  const sizing: Sizing = {
    failing: failing.map((r) => r.says),
    options: [],
    alone: [],
    runs,
    partial: false,
  }
  if (!failing.length) return sizing
  const reqs = scene.requires ?? []
  const failingReqs = reqs.filter((_, i) => !before[i]!.ok)

  /** does every requirement in `which` hold with these changes? */
  function* holds(
    changes: Array<{ lever: Lever; k: number }>,
    which: number[] | 'all',
  ): Generator<{ runs: number }, boolean> {
    if (!more()) {
      sizing.partial = true
      return false
    }
    const r = results(applyLevers(scene, changes))
    yield { runs }
    return which === 'all' ? r.every((x) => x.ok) : which.every((i) => r[i]!.ok)
  }

  /** the smallest factor on these levers together that makes `which` hold */
  function* factor(
    levers: Lever[],
    which: number[] | 'all',
    directions: number[] = [UP, DOWN],
  ): Generator<{ runs: number }, number | undefined> {
    const at = (k: number) => levers.map((lever) => ({ lever, k }))
    for (const far of directions) {
      if (!(yield* holds(at(far), which))) continue
      let [bad, good] = [1, far]
      for (let i = 0; i < STEPS; i++) {
        const mid = Math.sqrt(bad * good)
        if (yield* holds(at(mid), which)) good = mid
        else bad = mid
      }
      return good
    }
    return undefined
  }

  /** a factor made readable, checked again; the exact one if the round one misses */
  function* settle(
    levers: Lever[],
    factors: number[],
    which: number[] | 'all',
  ): Generator<{ runs: number }, SizingOption> {
    const at = (ks: number[]) =>
      levers.map((lever, i) => ({ lever, k: ks[i]! }))
    let ks = levers.map((l, i) => niceFactor(l, factors[i]!))
    if (!(yield* holds(at(ks), which))) ks = factors
    // listed in the direction things flow: the supply first
    const changes = levers.map((l, i) => changeOf(l, ks[i]!)).reverse()
    const s = applyLevers(scene, at(ks))
    return { changes, needs: needsOf(s, changes), scene: s }
  }

  /** every way to make `which` hold: one value at a time, else the path together */
  function* search(
    levers: Lever[],
    which: number[] | 'all',
    wantMore: boolean,
    /** only ever more: a floor is never met by making something smaller */
    onlyUp: boolean,
  ): Generator<{ runs: number }, SizingOption[]> {
    const found: Array<{ k: number; option: SizingOption }> = []
    for (const l of levers) {
      const k = yield* factor([l], which, onlyUp ? [UP] : [UP, DOWN])
      if (k !== undefined)
        found.push({ k, option: yield* settle([l], [k], which) })
      if (!more()) break
    }
    // and the supply path together, which is often what it takes: a bigger
    // pump is no use while the tank it fills can't take it in any faster
    // (a store's size is a buffer, not a rate, so it is offered on its own)
    const flows = levers.filter(
      (l) =>
        l.link !== undefined ||
        l.field !== 'capacity' ||
        scene.parts.find((p) => p.id === l.part)?.behaviour.role !== 'storage',
    )
    if (flows.length > 1 && more()) {
      const dir = wantMore ? [UP] : [DOWN]
      const k = yield* factor(flows, which, dir)
      if (k !== undefined) {
        // then each value back as far as it will go with the rest held,
        // furthest from the requirement first, so only what was needed stays
        const ks = flows.map(() => k)
        const at = (i: number, x: number) =>
          flows.map((lever, j) => ({ lever, k: j === i ? x : ks[j]! }))
        // first what isn't needed at all, with the rest at full stretch
        for (let i = flows.length - 1; i >= 0; i--)
          if (yield* holds(at(i, 1), which)) ks[i] = 1
        for (let i = flows.length - 1; i >= 0; i--) {
          if (ks[i] === 1) continue
          let [bad, good] = [1, ks[i]!]
          for (let step = 0; step < SHRINK_STEPS; step++) {
            const mid = Math.sqrt(bad * good)
            if (yield* holds(at(i, mid), which)) good = mid
            else bad = mid
          }
          ks[i] = good
        }
        const keep = flows.flatMap((_, i) => (ks[i] === 1 ? [] : [i]))
        if (keep.length > 1 || !found.length)
          found.push({
            k: Math.exp(
              keep.reduce((t, i) => t + Math.abs(Math.log(ks[i]!)), 0),
            ),
            option: yield* settle(
              keep.map((i) => flows[i]!),
              keep.map((i) => ks[i]!),
              which,
            ),
          })
      }
    }
    return found
      .sort((a, b) => Math.abs(Math.log(a.k)) - Math.abs(Math.log(b.k)))
      .slice(0, 3)
      .map((f) => f.option)
  }

  const all: Lever[] = []
  for (const r of failingReqs)
    for (const l of leversFor(scene, r))
      if (!all.some((x) => sameLever(x, l))) all.push(l)
  const floor = (r: Requirement) => r.min !== undefined && r.max === undefined
  sizing.options = yield* search(
    all.slice(0, MAX_LEVERS),
    'all',
    failingReqs.some((r) => r.min !== undefined),
    failingReqs.every(floor),
  )

  if (!sizing.options.length && failingReqs.length > 1 && more())
    for (const [i, r] of reqs.entries()) {
      if (before[i]!.ok) continue
      const options = yield* search(
        leversFor(scene, r),
        [i],
        r.min !== undefined,
        floor(r),
      )
      const breaks = options.map((o) =>
        checkRequirements(o.scene, simulateDay(o.scene, opts.controls))
          .filter((x, j) => !x.ok && j !== i)
          .map((x) => x.says),
      )
      sizing.alone.push({ says: before[i]!.says, options, breaks })
    }
  sizing.runs = runs
  return sizing
}

/** the whole search, at once */
export function sizeScene(scene: Scene, opts: SizingOptions = {}): Sizing {
  const it = sizing(scene, opts)
  for (;;) {
    const n = it.next()
    if (n.done) return n.value
  }
}

/** a sizing as text, for the MCP server's answer */
export function sizingLines(s: Sizing): string {
  if (!s.failing.length) return 'every requirement holds: nothing to size'
  const opt = (o: SizingOption, n: number) =>
    [
      `${n}. ${o.changes.map((c) => c.text).join('; ')}`,
      ...o.needs.map((x) => `   ${x}`),
    ].join('\n')
  const lines: string[] = []
  if (s.options.length)
    lines.push(
      `to make every requirement hold, any one of:`,
      ...s.options.map((o, i) => opt(o, i + 1)),
    )
  else if (s.alone.length) {
    lines.push(
      'no one change makes every requirement hold together. On its own:',
    )
    for (const a of s.alone) {
      lines.push(`- ${a.says}:`)
      if (!a.options.length)
        lines.push('  nothing upstream sizes it within 10×')
      a.options.forEach((o, i) => {
        lines.push(opt(o, i + 1).replace(/^/gm, '  '))
        if (a.breaks[i]?.length)
          lines.push(`     but then fails: ${a.breaks[i]!.join('; ')}`)
      })
    }
  } else
    lines.push(
      'nothing upstream sizes it within 10× (or a tenth): the limit may be a control, a demand, or a requirement that can never hold',
    )
  if (s.partial) lines.push(`(stopped after ${s.runs} simulated days)`)
  return lines.join('\n')
}
