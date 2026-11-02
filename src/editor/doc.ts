// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type {
  Behaviour,
  Domain,
  InstrumentSpec,
  LinkSpec,
  PartSpec,
  Requirement,
  Scene,
} from '../sim/types.ts'
import { cellsOf, routeLink } from './route.ts'
import { TEMPLATES, UNITS, dialOf } from './templates.ts'

/*
 * What the editor edits: a scene file, as JSON. Every edit is a pure function
 * from one file to the next that touches only what the person changed, so a
 * file an assistant wrote comes back out of the editor with nothing else
 * reordered, normalised or dropped (see doc.test.ts). Fields the editor knows
 * nothing about ride along untouched.
 */

/** a scene as a file holds it: the defaults left out, anything else kept */
export type Doc = Omit<
  Scene,
  'subtitle' | 'sheet' | 'units' | 'scale' | 'clock'
> &
  Partial<Pick<Scene, 'subtitle' | 'sheet' | 'units' | 'scale' | 'clock'>>

export type Cell = [number, number]

export type Result = { doc: Doc } | { error: string }

const near = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0]! - b[0]!) < 0.5 && Math.abs(a[1]! - b[1]!) < 0.5

/** the part sitting on a cell, if any */
export const partAt = (doc: Doc, cell: Cell) =>
  doc.parts.find((p) => near(p.at, cell))

/** the instrument sitting on a cell, if any */
export const instrumentAt = (doc: Doc, cell: Cell) =>
  (doc.instruments ?? []).findIndex((i) => near(i.at, cell))

export const isFree = (doc: Doc, cell: Cell) =>
  !partAt(doc, cell) && instrumentAt(doc, cell) < 0

/** a fresh id: battery, battery-2, … */
export function nextId(doc: Doc, base: string): string {
  const taken = (id: string) =>
    doc.parts.some((p) => p.id === id) ||
    (doc.switches ?? []).some((w) => w.id === id) ||
    (doc.knobs ?? []).some((k) => k.id === id)
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'part'
  if (!taken(stem)) return stem
  for (let n = 2; ; n++) if (!taken(`${stem}-${n}`)) return `${stem}-${n}`
}

/** the nearest free cell to one, inside the sheet, trying the row above first */
export function freeCellNear(doc: Doc, [c, r]: Cell): Cell | undefined {
  const order: Cell[] = []
  for (let d = 1; d < Math.max(...doc.size); d++)
    for (const [dc, dr] of [
      [0, -d],
      [d, -d],
      [-d, -d],
      [d, 0],
      [-d, 0],
      [0, d],
      [d, d],
      [-d, d],
    ] as Cell[])
      order.push([c + dc, r + dr])
  return order.find(
    ([x, y]) =>
      x >= 0 &&
      y >= 0 &&
      x < doc.size[0] &&
      y < doc.size[1] &&
      isFree(doc, [x, y]),
  )
}

// ---------------------------------------------------------------- flows

/**
 * What a part can take in and give out. A part made from a template says so;
 * otherwise its role and the links it already has do. Empty when nothing is
 * known yet, which leaves the choice to whatever it is linked to.
 */
export function domainsOf(
  doc: Doc,
  part: PartSpec,
): { takes: Domain[]; gives: Domain[] } {
  const takes = new Set<Domain>()
  const gives = new Set<Domain>()
  const t = TEMPLATES.get(part.kind)
  const b = part.behaviour
  if (t && t.behaviour({ size: 1, on: '1' }).role === b.role) {
    t.takes.forEach((d) => takes.add(d))
    t.gives.forEach((d) => gives.add(d))
  }
  for (const l of doc.links) {
    if (l.loss) continue
    if (l.to === part.id) takes.add(l.domain)
    if (l.from === part.id) gives.add(l.domain)
  }
  if (b.role === 'converter') {
    gives.add(b.output)
    for (const d of Object.keys(b.recipe)) takes.add(d as Domain)
  }
  // a junction, a valve or a store passes on what it is given
  if (b.role === 'bus' || b.role === 'gate' || b.role === 'storage') {
    const all = new Set([...takes, ...gives])
    all.forEach((d) => (takes.add(d), gives.add(d)))
  }
  if (b.role === 'source' || b.role === 'vent') takes.clear()
  if (b.role === 'sink') gives.clear()
  return { takes: [...takes], gives: [...gives] }
}

/** the domains that could run from one part to another, best first */
export function flowsBetween(doc: Doc, from: PartSpec, to: PartSpec): Domain[] {
  const a = domainsOf(doc, from)
  const b = domainsOf(doc, to)
  const both = a.gives.filter((d) => b.takes.includes(d))
  if (both.length) return both
  // one end knows nothing yet: it takes (or gives) whatever the other does
  const open = (p: PartSpec, side: 'gives' | 'takes') => {
    const r = p.behaviour.role
    const d = domainsOf(doc, p)[side]
    return (
      d.length === 0 &&
      (side === 'gives' ? r !== 'sink' && r !== 'vent' : r !== 'source')
    )
  }
  if (open(from, 'gives') && open(to, 'takes')) return ['electric']
  if (open(from, 'gives')) return b.takes
  if (open(to, 'takes')) return a.gives
  return []
}

/** the biggest number a part is sized to, for drawing its lines */
function sizeHint(part: PartSpec): number {
  const b = part.behaviour
  if (b.role === 'converter') return b.capacity ?? 0
  if (b.role === 'source') return dialOf(b.output)?.size ?? 0
  if (b.role === 'sink') return dialOf(b.demand)?.size ?? 0
  return 0
}

/** units for a domain, and a scale at least as big as what now flows in it */
function withDomain(doc: Doc, d: Domain): Doc {
  const units = doc.units?.[d] ? doc.units : { ...doc.units, [d]: UNITS[d] }
  const linked = new Set(
    doc.links.filter((l) => l.domain === d).flatMap((l) => [l.from, l.to]),
  )
  const want = Math.max(
    1,
    ...doc.parts.filter((p) => linked.has(p.id)).map(sizeHint),
  )
  const has = doc.scale?.[d]
  const scale =
    has !== undefined && has >= want ? doc.scale : { ...doc.scale, [d]: want }
  return units === doc.units && scale === doc.scale
    ? doc
    : { ...doc, units, scale }
}

// ---------------------------------------------------------------- links

/** route one link of the sheet among the others already drawn */
function routed(doc: Doc, index: number): LinkSpec {
  const link = doc.links[index]!
  const others = doc.links.filter((_, i) => i !== index)
  const drawn = others.flatMap((l) => {
    const cells = cellsOf(doc, l)
    return cells ? [cells] : []
  })
  const twinLink = others.find((l) => l.from === link.to && l.to === link.from)
  const twin = twinLink ? cellsOf(doc, twinLink) : undefined
  const { route } = routeLink(doc, link, drawn, twin)
  const { via: _via, bend: _bend, ...rest } = link
  return { ...rest, ...route }
}

/**
 * Link two parts. The flow is the first thing one gives that the other takes,
 * or `domain` when given. A store or a supply wired to a junction gets the
 * return link too, so it can both charge and discharge.
 */
export function connect(
  doc: Doc,
  fromId: string,
  toId: string,
  domain?: Domain,
): Result {
  const from = doc.parts.find((p) => p.id === fromId)
  const to = doc.parts.find((p) => p.id === toId)
  if (!from || !to || from === to) return { error: 'Pick two different parts.' }
  const options = flowsBetween(doc, from, to)
  const d = domain ?? options[0]
  if (!d || (domain && !options.includes(domain))) {
    const a = domainsOf(doc, from).gives
    const b = domainsOf(doc, to).takes
    const gives = a.length ? a.join(' or ') : 'nothing on'
    const takes = b.length ? b.join(' or ') : 'nothing in'
    return {
      error: `${from.label} gives ${gives}; ${to.label} takes ${takes}. Nothing can flow between them.`,
    }
  }
  const exists = (f: string, t: string) =>
    doc.links.some((l) => l.from === f && l.to === t && l.domain === d)
  if (exists(fromId, toId)) return { error: 'Those two are already linked.' }

  let next: Doc = {
    ...doc,
    links: [...doc.links, { from: fromId, to: toId, domain: d }],
  }
  next = {
    ...next,
    links: next.links.map((l, i) =>
      i === next.links.length - 1 ? routed(next, i) : l,
    ),
  }
  const store = (p: PartSpec) => p.behaviour.role === 'storage'
  const junction = (p: PartSpec) => p.behaviour.role === 'bus'
  if (
    ((store(from) && junction(to)) || (junction(from) && store(to))) &&
    !exists(toId, fromId)
  ) {
    next = {
      ...next,
      links: [...next.links, { from: toId, to: fromId, domain: d }],
    }
    next = {
      ...next,
      links: next.links.map((l, i) =>
        i === next.links.length - 1 ? routed(next, i) : l,
      ),
    }
  }
  return { doc: withDomain(next, d) }
}

/** drop a link, and its return link if it has one */
export function removeLink(doc: Doc, index: number): Doc {
  const link = doc.links[index]
  if (!link) return doc
  return {
    ...doc,
    links: doc.links.filter(
      (l, i) =>
        i !== index &&
        !(l.from === link.to && l.to === link.from && l.domain === link.domain),
    ),
  }
}

/** change a link's fields; a field set to undefined is removed */
export function patchLink(
  doc: Doc,
  index: number,
  patch: Partial<LinkSpec>,
): Doc {
  return {
    ...doc,
    links: doc.links.map((l, i) => (i === index ? merge(l, patch) : l)),
  }
}

/** turn a link's corner the other way */
export function flipLink(doc: Doc, index: number): Doc {
  const l = doc.links[index]
  if (!l) return doc
  const { via: _via, ...rest } = l
  return {
    ...doc,
    links: doc.links.map((x, i) =>
      i === index ? { ...rest, bend: l.bend === 'vh' ? 'hv' : 'vh' } : x,
    ),
  }
}

/** let the editor find a link a fresh path */
export function rerouteLink(doc: Doc, index: number): Doc {
  if (!doc.links[index]) return doc
  return {
    ...doc,
    links: doc.links.map((l, i) => (i === index ? routed(doc, i) : l)),
  }
}

// ---------------------------------------------------------------- parts

/** a field set to undefined is removed rather than written as undefined */
function merge<T extends object>(base: T, patch: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch))
    if (v === undefined) delete out[k]
    else out[k] = v
  return out as T
}

export function addPart(
  doc: Doc,
  part: PartSpec,
  sw?: { id: string; label: string; on: boolean },
): Doc {
  const next: Doc = { ...doc, parts: [...doc.parts, part] }
  if (sw && !(doc.switches ?? []).some((w) => w.id === sw.id))
    next.switches = [...(doc.switches ?? []), sw]
  return next
}

/** change a part's fields; a field set to undefined is removed */
export function patchPart(doc: Doc, id: string, patch: Partial<PartSpec>): Doc {
  return {
    ...doc,
    parts: doc.parts.map((p) => (p.id === id ? merge(p, patch) : p)),
  }
}

/** change some of a part's behaviour fields, keeping its role */
export function patchBehaviour(
  doc: Doc,
  id: string,
  patch: Record<string, unknown>,
): Doc {
  return {
    ...doc,
    parts: doc.parts.map((p) =>
      p.id === id
        ? { ...p, behaviour: merge(p.behaviour, patch as Partial<Behaviour>) }
        : p,
    ),
  }
}

/** move a part; its links find new paths, every other line stays put */
export function movePart(doc: Doc, id: string, at: Cell): Doc {
  let next: Doc = {
    ...doc,
    parts: doc.parts.map((p) => (p.id === id ? { ...p, at } : p)),
  }
  next.links.forEach((l, i) => {
    if (l.from === id || l.to === id)
      next = {
        ...next,
        links: next.links.map((x, j) => (j === i ? routed(next, i) : x)),
      }
  })
  return next
}

/** drop a part with everything wired to it, its own switch, and its instruments */
export function removePart(doc: Doc, id: string): Doc {
  const part = doc.parts.find((p) => p.id === id)
  if (!part) return doc
  const parts = doc.parts.filter((p) => p.id !== id)
  const next: Doc = {
    ...doc,
    parts,
    links: doc.links.filter((l) => l.from !== id && l.to !== id),
  }
  if (
    doc.switches &&
    part.toggles === id &&
    !parts.some((p) => p.toggles === id)
  )
    next.switches = doc.switches.filter((w) => w.id !== id)
  if (doc.instruments) {
    const gone = new Set<string>()
    let list = doc.instruments
    // an instrument on the part goes, and so does one that only read it
    for (let changed = true; changed;) {
      changed = false
      list = list.filter((i) => {
        const drop = i.measures === id || gone.has(i.measures)
        if (drop) {
          gone.add(i.tag)
          changed = true
        }
        return !drop
      })
    }
    next.instruments = list.map((i) =>
      i.drives === id ? merge(i, { drives: undefined }) : i,
    )
  }
  if (doc.requires?.some((r) => r.part === id)) {
    const left = doc.requires.filter((r) => r.part !== id)
    if (left.length) next.requires = left
    else delete next.requires
  }
  return next
}

/** rename a part, everywhere it is named */
export function renamePart(doc: Doc, id: string, to: string): Result {
  if (id === to) return { doc }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(to))
    return { error: 'An id is lowercase letters, digits and dashes.' }
  if (doc.parts.some((p) => p.id === to))
    return { error: `There is already a part called ${to}.` }
  const swap = (s: string) => (s === id ? to : s)
  const refs = (s: unknown) =>
    typeof s === 'string'
      ? s.replace(
          new RegExp(`(prev|part)\\('${id.replace(/-/g, '\\-')}'\\)`, 'g'),
          `$1('${to}')`,
        )
      : s
  const signals = (b: Behaviour) =>
    Object.fromEntries(
      Object.entries(b).map(([k, v]) => [k, refs(v)]),
    ) as unknown as Behaviour
  const next: Doc = {
    ...doc,
    parts: doc.parts.map((p) => ({
      ...p,
      id: swap(p.id),
      behaviour: signals(p.behaviour),
    })),
    links: doc.links.map((l) => ({ ...l, from: swap(l.from), to: swap(l.to) })),
  }
  if (doc.instruments)
    next.instruments = doc.instruments.map((i) =>
      merge(i, {
        measures: swap(i.measures),
        drives: i.drives === undefined ? undefined : swap(i.drives),
        reads: refs(i.reads) as string | undefined,
      }),
    )
  if (doc.expect)
    next.expect = doc.expect.map((e) => ({
      ...e,
      check: refs(e.check) as string,
    }))
  if (doc.requires)
    next.requires = doc.requires.map((r) =>
      r.part === id ? { ...r, part: to } : r,
    )
  return { doc: next }
}

// ---------------------------------------------------------------- the rest

export function setSwitch(doc: Doc, id: string, on: boolean): Doc {
  return {
    ...doc,
    switches: (doc.switches ?? []).map((w) => (w.id === id ? { ...w, on } : w)),
  }
}

/** change the sheet's own fields; a field set to undefined is removed */
export function patchSheet(doc: Doc, patch: Partial<Doc>): Doc {
  return merge(doc, patch)
}

// ---------------------------------------------------------------- requirements

export function addRequirement(doc: Doc, r: Requirement): Doc {
  return { ...doc, requires: [...(doc.requires ?? []), r] }
}

export function removeRequirement(doc: Doc, index: number): Doc {
  const left = (doc.requires ?? []).filter((_, i) => i !== index)
  const next = { ...doc }
  if (left.length) next.requires = left
  else delete next.requires
  return next
}

/**
 * make a sizing's changes in the file: each value as the search left it, so
 * a number stays a number and an expression is scaled where it stands
 */
export function applySizing(
  doc: Doc,
  changes: ReadonlyArray<{
    part: string
    link?: number
    field: string
    factor: number
    to?: number | null
  }>,
): Doc {
  let next = doc
  let to: number | null | undefined
  const scale = (v: unknown, k: number): unknown =>
    typeof v === 'number'
      ? (to ?? Number((v * k).toPrecision(6)))
      : typeof v === 'string'
        ? `${Number(k.toPrecision(3))} * (${v})`
        : v
  for (const c of changes) {
    to = c.to
    if (c.link !== undefined) {
      const l = next.links[c.link]
      if (l?.capacity !== undefined)
        next = patchLink(next, c.link, {
          capacity: scale(l.capacity, c.factor) as number,
        })
      continue
    }
    const p = next.parts.find((x) => x.id === c.part)
    if (!p) continue
    if (c.field === 'boost' || c.field === 'set') {
      const v = p.effort?.[c.field]
      if (v !== undefined)
        next = patchPart(next, p.id, {
          effort: { ...p.effort, [c.field]: scale(v, c.factor) },
        })
    } else {
      const v = (p.behaviour as unknown as Record<string, unknown>)[c.field]
      if (v !== undefined)
        next = patchBehaviour(next, p.id, { [c.field]: scale(v, c.factor) })
    }
  }
  return next
}

export function addInstrument(doc: Doc, inst: InstrumentSpec): Doc {
  return { ...doc, instruments: [...(doc.instruments ?? []), inst] }
}

export function patchInstrument(
  doc: Doc,
  index: number,
  patch: Partial<InstrumentSpec>,
): Doc {
  const list = doc.instruments ?? []
  const old = list[index]
  if (!old) return doc
  return {
    ...doc,
    instruments: list.map((i, k) => {
      if (k === index) return merge(i, patch)
      // a controller reading this one follows it to its new tag
      if (patch.tag && i.measures === old.tag)
        return { ...i, measures: patch.tag }
      return i
    }),
  }
}

export function removeInstrument(doc: Doc, index: number): Doc {
  const list = doc.instruments ?? []
  const gone = list[index]
  if (!gone) return doc
  return {
    ...doc,
    instruments: list.filter((i, k) => k !== index && i.measures !== gone.tag),
  }
}

export function moveInstrument(doc: Doc, index: number, at: Cell): Doc {
  return patchInstrument(doc, index, { at })
}
