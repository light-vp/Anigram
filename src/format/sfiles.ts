// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf, PACKS } from '../packs/catalogue.ts'
import type {
  Behaviour,
  Knob,
  LinkSpec,
  PartSpec,
  Scene,
  Switch,
} from '../sim/types.ts'
import { autoLayout } from '../view/autoLayout.ts'
import { validateScene } from './validate.ts'

/*
 * SFILES 2.0, the line notation for flowsheets (Vogel et al., 2023): a whole
 * process flow diagram as one string, the way SMILES writes a molecule.
 *
 *   (raw)(pp)(hex)(r)[(prod)](dist){tout}(prod)
 *
 * Units are written in brackets, `(pp)` a pump, and one after another are
 * joined by a stream. `[...]` is a branch off the unit before it; after the
 * `]` the main line carries on from that unit. `<&|...&|` is a branch that
 * flows *into* the unit before it, with `&` joining its current unit to that
 * unit without ending it, and `|` ending it without a join. A digit after a
 * unit, `1`, starts a stream to wherever `<1` appears (`%12` and `<%12` past
 * nine), which is how recycles and any other join are written. `n|` starts
 * a separate flowsheet. `{tout}` and the like name which outlet a stream
 * leaves by; `{1}` right after a heat exchanger marks two passes through the
 * same one. `_1` / `<_1` are control signals.
 *
 * Read from the paper and written from scratch: the reader turns a string
 * into a PFD scene with the same guessed behaviours a DEXPI import gets, the
 * writer turns any scene's process streams back into a string.
 */

export interface SfilesImport {
  scene: Scene
  /** what didn't come across or was guessed, in words */
  notes: string[]
  counts: {
    units: number
    streams: number
    /** streams written as numbered joins: recycles and the like */
    recycles: number
    /** control units left out: a PFD doesn't draw them */
    controls: number
  }
}

export interface SfilesImportOptions {
  id?: string
  title?: string
  /** `pfd` (the default) or `pid`, which also draws the valves */
  drawing?: 'pfd' | 'pid'
}

export class SfilesError extends Error {
  readonly at: number
  constructor(message: string, at: number) {
    super(`${message} (at character ${at + 1})`)
    this.at = at
  }
}

/** the nominal flow the guessed behaviours are sized from, in m³/h */
const Q = 60

// ------------------------------------------------------------ the units

interface UnitInfo {
  /** what it is, as a reader would say it */
  label: string
  /** the P&ID / PFD class it's drawn as */
  cls?: string
  kind: string
  /** the letter its equipment tag starts with, for major equipment */
  tag?: string
  /** how it behaves; a bus when left out */
  role?: 'source' | 'sink' | 'gate' | 'storage' | 'machine'
}

/** SFILES 2.0's unit abbreviations (after OntoCape), as Anigram parts */
const UNITS: Record<string, UnitInfo> = {
  raw: { label: 'Feed', cls: 'OffPageConnector', kind: 'well', role: 'source' },
  prod: {
    label: 'Product',
    cls: 'OffPageConnector',
    kind: 'tap',
    role: 'sink',
  },
  pp: {
    label: 'Pump',
    cls: 'CentrifugalPump',
    kind: 'pump',
    tag: 'P',
    role: 'machine',
  },
  comp: {
    label: 'Compressor',
    cls: 'Compressor',
    kind: 'fan',
    tag: 'K',
    role: 'machine',
  },
  blwr: { label: 'Blower', cls: 'Fan', kind: 'fan', tag: 'K', role: 'machine' },
  turb: { label: 'Turbine', cls: 'Turbine', kind: 'turbine', tag: 'KT' },
  hex: {
    label: 'Heat exchanger',
    cls: 'HeatExchanger',
    kind: 'radiator',
    tag: 'E',
  },
  reb: { label: 'Reboiler', cls: 'HeatExchanger', kind: 'radiator', tag: 'E' },
  cond: {
    label: 'Condenser',
    cls: 'HeatExchanger',
    kind: 'radiator',
    tag: 'E',
  },
  tank: {
    label: 'Tank',
    cls: 'Tank',
    kind: 'reservoir',
    tag: 'TK',
    role: 'storage',
  },
  r: { label: 'Reactor', cls: 'Vessel', kind: 'hottank', tag: 'R' },
  dist: {
    label: 'Distillation column',
    cls: 'Vessel',
    kind: 'hottank',
    tag: 'C',
  },
  rect: {
    label: 'Rectification column',
    cls: 'Vessel',
    kind: 'hottank',
    tag: 'C',
  },
  strip: {
    label: 'Stripping column',
    cls: 'Vessel',
    kind: 'hottank',
    tag: 'C',
  },
  abs: { label: 'Absorption column', cls: 'Vessel', kind: 'hottank', tag: 'C' },
  extr: {
    label: 'Extraction column',
    cls: 'Vessel',
    kind: 'hottank',
    tag: 'C',
  },
  scrub: { label: 'Scrubber', cls: 'Vessel', kind: 'hottank', tag: 'C' },
  flash: { label: 'Flash drum', cls: 'Vessel', kind: 'hottank', tag: 'V' },
  sep: { label: 'Separator', cls: 'Vessel', kind: 'hottank', tag: 'V' },
  centr: { label: 'Centrifuge', cls: 'Vessel', kind: 'hottank', tag: 'S' },
  cycl: { label: 'Cyclone', cls: 'Vessel', kind: 'hottank', tag: 'S' },
  hcycl: { label: 'Hydrocyclone', cls: 'Vessel', kind: 'hottank', tag: 'S' },
  egclean: { label: 'Gas cleaner', cls: 'Vessel', kind: 'hottank', tag: 'S' },
  X: { label: 'Unit', cls: 'Vessel', kind: 'hottank', tag: 'X' },
  lfil: { label: 'Filter', cls: 'Filter', kind: 'treatment', tag: 'F' },
  gfil: { label: 'Gas filter', cls: 'Filter', kind: 'treatment', tag: 'F' },
  v: { label: 'Valve', cls: 'GateValve', kind: 'valve', role: 'gate' },
  mix: { label: 'Mixer', cls: 'Junction', kind: 'manifold' },
  splt: { label: 'Splitter', cls: 'Junction', kind: 'manifold' },
  pipe: { label: 'Pipe', cls: 'Junction', kind: 'manifold' },
  orif: { label: 'Orifice', cls: 'Junction', kind: 'manifold' },
}

/** control units: SFILES 2.0 writes controllers into the string, a PFD doesn't draw them */
const CONTROL = 'C'

// ------------------------------------------------------------ tokens

type Token =
  | { t: 'unit'; name: string; at: number }
  | { t: 'tag'; tag: string; at: number }
  | {
      t: 'open' | 'close' | 'in' | 'join' | 'joinEnd' | 'end' | 'new'
      at: number
    }
  | { t: 'from' | 'to'; n: number; signal: boolean; at: number }

const PATTERN =
  /\(([^()]*)\)|\{([^{}]*)\}|(<&\|)|(&\|)|(n\|)|(<)?(_)?(?:%(\d+)|(\d))|(\[)|(\])|(&)|(\|)|(\s+)/y

function tokenize(src: string): Token[] {
  const out: Token[] = []
  PATTERN.lastIndex = 0
  let i = 0
  while (i < src.length) {
    PATTERN.lastIndex = i
    const m = PATTERN.exec(src)
    if (!m) throw new SfilesError(`"${src[i]}" is not SFILES`, i)
    const at = i
    i = PATTERN.lastIndex
    if (m[1] !== undefined) {
      if (!m[1].trim()) throw new SfilesError('a unit with no name', at)
      out.push({ t: 'unit', name: m[1].trim(), at })
    } else if (m[2] !== undefined) out.push({ t: 'tag', tag: m[2].trim(), at })
    else if (m[3]) out.push({ t: 'in', at })
    else if (m[4]) out.push({ t: 'joinEnd', at })
    else if (m[5]) out.push({ t: 'new', at })
    else if (m[8] !== undefined || m[9] !== undefined)
      out.push({
        t: m[6] ? 'to' : 'from',
        n: Number(m[8] ?? m[9]),
        signal: !!m[7],
        at,
      })
    else if (m[10]) out.push({ t: 'open', at })
    else if (m[11]) out.push({ t: 'close', at })
    else if (m[12]) out.push({ t: 'join', at })
    else if (m[13]) out.push({ t: 'end', at })
    else if (m[6] || m[7]) throw new SfilesError('a join with no number', at)
  }
  return out
}

// ------------------------------------------------------------ reading

interface Graph {
  /** each unit's SFILES type, in the order the string names them */
  units: string[]
  /** streams as unit indices, in the order written */
  edges: Array<[number, number]>
  recycles: number
  signals: number
  outlets: number
}

/** the flowsheet a string describes */
export function parseSfiles(src: string): Graph {
  const tokens = tokenize(src)
  const units: string[] = []
  const edges: Array<[number, number]> = []
  const named = new Map<string, number>()
  type Frame = { kind: 'branch'; at: number } | { kind: 'in'; target: number }
  const stack: Frame[] = []
  const from = new Map<string, { unit: number; at: number }>()
  const to = new Map<string, { unit: number; at: number }>()
  let prev: number | null = null
  let signals = 0
  let outlets = 0
  const edge = (a: number, b: number) => {
    if (a !== b) edges.push([a, b])
  }
  const need = (at: number, what: string): number => {
    if (prev === null)
      throw new SfilesError(`${what} with no unit before it`, at)
    return prev
  }

  tokens.forEach((tok, k) => {
    switch (tok.t) {
      case 'unit': {
        // `(hex){1}` twice is one exchanger passed through twice; a numbered
        // name, `(pp-1)`, is one unit however often it's written
        const next = tokens[k + 1]
        const pass =
          next?.t === 'tag' && /^\d+$/.test(next.tag) ? next.tag : undefined
        const base = tok.name.replace(/\/.*$/, '')
        const key = pass
          ? `${base}{${pass}}`
          : /-\d+$/.test(base)
            ? base
            : undefined
        let u = key !== undefined ? named.get(key) : undefined
        if (u === undefined) {
          u = units.push(base.replace(/-\d+$/, '')) - 1
          if (key !== undefined) named.set(key, u)
        }
        if (prev !== null) edge(prev, u)
        prev = u
        break
      }
      case 'tag':
        if (!/^\d+$/.test(tok.tag) && !/^[A-Z]+$/.test(tok.tag)) outlets++
        break
      case 'open':
        stack.push({ kind: 'branch', at: need(tok.at, 'a branch') })
        break
      case 'close': {
        const f = stack.pop()
        if (f?.kind !== 'branch')
          throw new SfilesError('"]" closes no branch', tok.at)
        prev = f.at
        break
      }
      case 'in':
        stack.push({ kind: 'in', target: need(tok.at, 'an incoming branch') })
        prev = null
        break
      case 'join': {
        const f = [...stack].reverse().find((x) => x.kind === 'in')
        if (!f || f.kind !== 'in')
          throw new SfilesError('"&" outside an incoming branch', tok.at)
        edge(need(tok.at, '"&"'), f.target)
        break
      }
      case 'joinEnd':
      case 'end': {
        const f = stack.pop()
        if (f?.kind !== 'in')
          throw new SfilesError(
            `"${tok.t === 'end' ? '|' : '&|'}" ends no incoming branch`,
            tok.at,
          )
        if (tok.t === 'joinEnd') edge(need(tok.at, '"&|"'), f.target)
        prev = f.target
        break
      }
      case 'new':
        if (stack.length) throw new SfilesError('"n|" inside a branch', tok.at)
        prev = null
        break
      case 'from':
      case 'to': {
        if (tok.signal) {
          signals++
          break
        }
        const map = tok.t === 'from' ? from : to
        const n = String(tok.n)
        if (map.has(n))
          throw new SfilesError(
            `${tok.t === 'from' ? '' : '<'}${tok.n > 9 ? '%' : ''}${n} is written twice`,
            tok.at,
          )
        map.set(n, { unit: need(tok.at, `join ${n}`), at: tok.at })
        break
      }
    }
  })
  const open = stack.at(-1)
  if (open)
    throw new SfilesError(
      open.kind === 'branch'
        ? 'a "[" is never closed'
        : 'a "<&|" is never ended',
      src.length - 1,
    )
  for (const [n, a] of from) {
    const b = to.get(n)
    if (!b) throw new SfilesError(`join ${n} goes nowhere: no <${n}`, a.at)
    edge(a.unit, b.unit)
  }
  for (const [n, b] of to)
    if (!from.has(n))
      throw new SfilesError(`<${n} has no join ${n} to come from`, b.at)
  if (!units.length) throw new SfilesError('no units', 0)
  return { units, edges, recycles: from.size, signals, outlets }
}

/** an SFILES 2.0 string as a process flow diagram */
export function fromSfiles(
  src: string,
  opts: SfilesImportOptions = {},
): SfilesImport {
  const g = parseSfiles(src)
  const notes: string[] = []
  const drawing = opts.drawing ?? 'pfd'

  // controllers come out; the streams through them are joined up
  const controls = g.units.filter((u) => u === CONTROL).length
  let edges = g.edges
  if (controls) {
    const isC = (u: number) => g.units[u] === CONTROL
    const bridged: Array<[number, number]> = []
    for (const [a, b] of edges) {
      if (isC(a)) continue
      if (!isC(b)) bridged.push([a, b])
      else
        for (const [c, d] of edges)
          if (c === b && !isC(d) && d !== a) bridged.push([a, d])
    }
    edges = bridged
    notes.push(
      `${controls === 1 ? 'one control unit' : `${controls} control units`} left out: a ${drawing === 'pfd' ? 'PFD' : 'P&ID imported from SFILES'} doesn't draw them from the string`,
    )
  }
  if (g.signals)
    notes.push(
      'control signals (_1, <_1) left out: a PFD draws no signal lines',
    )
  // one stream per pair of units
  const seen = new Set<string>()
  const streams = edges.filter(([a, b]) => {
    const k = `${a}>${b}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (streams.length < edges.length)
    notes.push(
      'streams written twice between the same two units are drawn once',
    )
  if (g.outlets)
    notes.push(
      'outlet tags ({tout}, {bout}, {hot_in}…) are read but not drawn: each stream is one line',
    )

  const keep = g.units.map((u) => u !== CONTROL)
  const unknown = new Set(g.units.filter((u, i) => keep[i] && !UNITS[u]))
  if (unknown.size)
    notes.push(
      `${[...unknown].map((u) => `(${u})`).join(', ')} ${unknown.size === 1 ? 'is' : 'are'} not an SFILES 2.0 unit; drawn as a vessel`,
    )

  // ids, labels and tags
  const typeCount = new Map<string, number>()
  for (const [i, u] of g.units.entries())
    if (keep[i]) typeCount.set(u, (typeCount.get(u) ?? 0) + 1)
  const seq = new Map<string, number>()
  const tagSeq = new Map<string, number>()
  const ids: string[] = []
  const knobs: Knob[] = [
    {
      id: 'throughput',
      label: 'throughput',
      value: 1,
      min: 0,
      max: 1.5,
      step: 0.05,
      format: '{pct}%',
    },
  ]
  const switches: Switch[] = []
  const ins = (i: number) => streams.filter(([, b]) => b === i).length
  const outs = (i: number) => streams.filter(([a]) => a === i).length
  const guessed = { sources: 0, sinks: 0 }
  const parts: PartSpec[] = []
  for (const [i, u] of g.units.entries()) {
    if (!keep[i]) {
      ids.push('')
      continue
    }
    const info: UnitInfo = UNITS[u] ?? {
      label: u,
      cls: 'Vessel',
      kind: 'hottank',
      tag: 'X',
    }
    const n = (seq.get(u) ?? 0) + 1
    seq.set(u, n)
    const base = (
      u.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unit'
    ).replace(/^-+/, '')
    const id = `${/^[a-z0-9]/.test(base) ? base : 'unit'}-${n}`
    ids.push(id)
    const many = (typeCount.get(u) ?? 0) > 1
    let tag: string | undefined
    if (info.tag) {
      const t = (tagSeq.get(info.tag) ?? 100) + 1
      tagSeq.set(info.tag, t)
      tag = `${info.tag}-${t}`
    }
    const label = many && !tag ? `${info.label} ${n}` : info.label
    const name = tag ?? label
    let role = info.role
    if (role !== 'source' && !ins(i) && outs(i)) {
      role = 'source'
      guessed.sources++
    } else if (role !== 'sink' && role !== 'storage' && ins(i) && !outs(i)) {
      role = 'sink'
      guessed.sinks++
    }
    let behaviour: Behaviour
    switch (role) {
      case 'source':
        behaviour = { role: 'source', output: 1.5 * Q }
        break
      case 'sink':
        behaviour = { role: 'sink', demand: `${Q} * knob('throughput')` }
        break
      case 'storage':
        behaviour = {
          role: 'storage',
          capacity: 4 * Q,
          start: 0.5,
          maxIn: 2 * Q,
          maxOut: 2 * Q,
        }
        break
      case 'machine':
        switches.push({ id, label: `${name} running`, on: true })
        behaviour = {
          role: 'gate',
          capacity: 1.5 * Q,
          open: `on('${id}') ? 1 : 0`,
        }
        break
      case 'gate':
        switches.push({ id, label: `${name} open`, on: true })
        behaviour = {
          role: 'gate',
          capacity: 3 * Q,
          open: `on('${id}') ? 1 : 0`,
        }
        break
      default:
        behaviour = { role: 'bus' }
    }
    const part: PartSpec = {
      id,
      kind: info.kind,
      label,
      at: [0, 0],
      behaviour,
      note: `${info.label}: (${u}) in the SFILES string.`,
    }
    // a PFD has no valve symbols: a valve there is drawn as a plain junction
    const cls =
      drawing === 'pfd' && info.cls && !(info.cls in PACKS.pfd!.classes)
        ? undefined
        : info.cls
    if (cls) part.class = cls
    if (tag) part.tag = tag
    if (switches.some((s) => s.id === id)) part.toggles = id
    parts.push(part)
  }
  if (!parts.length) throw new SfilesError('nothing but control units', 0)
  // the products share what the feeds bring, so at full throughput nothing
  // is short and the slider can push it until something is
  const feeds = parts.filter((p) => p.behaviour.role === 'source').length
  const sinks = parts.filter((p) => p.behaviour.role === 'sink')
  const share = Math.round((Q * Math.max(feeds, 1) * 10) / sinks.length) / 10
  for (const p of sinks)
    p.behaviour = { role: 'sink', demand: `${share} * knob('throughput')` }
  if (guessed.sources)
    notes.push(
      `${guessed.sources} unit(s) with nothing flowing in are drawn as feeds`,
    )
  if (guessed.sinks)
    notes.push(
      `${guessed.sinks} unit(s) where a line ends are drawn as taking product away`,
    )

  const links: LinkSpec[] = streams.map(([a, b]) => ({
    from: ids[a]!,
    to: ids[b]!,
    domain: 'water',
  }))

  // a starting place on the grid, then laid out by the flow
  parts.forEach((p, i) => (p.at = [i % 40, Math.floor(i / 40) % 40]))
  const title = opts.title ?? 'Imported flowsheet'
  const scene: Scene = {
    anigram: 1,
    id:
      opts.id ??
      (title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) ||
        'sfiles-import'),
    title,
    subtitle: `From SFILES 2.0: ${parts.length} units, ${links.length} streams`,
    sheet: 'SFILES',
    drawing,
    size: [40, 40],
    units: { water: { rate: 'm³/h', amount: 'm³' } },
    scale: { water: 2 * Q },
    parts,
    links,
    knobs,
    ...(switches.length ? { switches } : {}),
    clock: { start: 6, rate: 1 },
  }
  const checked = validateScene(structuredClone(scene)).scene
  if (checked) {
    const laid = autoLayout(checked).scene
    const at = new Map(laid.parts.map((p) => [p.id, p.at]))
    for (const p of scene.parts) p.at = at.get(p.id) ?? p.at
    const vias = new Map(
      laid.links.map((l) => [`${l.from}>${l.to}`, l.via] as const),
    )
    for (const l of scene.links) {
      const via = vias.get(`${l.from}>${l.to}`)
      if (via) l.via = via
    }
    scene.size = laid.size
  }
  notes.push(
    `behaviours are guessed from each unit (feeds of ${Q * 1.5} m³/h, products sharing ${Q} m³/h for each feed, pumps rated ${Q * 1.5} m³/h): set real duties before trusting a number`,
  )
  if (g.recycles)
    notes.push(
      'flow is pulled by what the products take, so a recycle only carries what the feeds cannot supply: it is drawn, but idle while they keep up',
    )
  return {
    scene,
    notes,
    counts: {
      units: parts.length,
      streams: links.length,
      recycles: g.recycles,
      controls,
    },
  }
}

// ------------------------------------------------------------ writing

/** the SFILES unit a part is, from its class, then its label, then its role */
function unitOf(p: PartSpec, scene: Scene, ins: number, outs: number): string {
  const r = p.behaviour.role
  if (r === 'source') return 'raw'
  if (r === 'sink' || r === 'vent') return 'prod'
  const words = p.label.toLowerCase()
  const byLabel: Array<[RegExp, string]> = [
    [/reboiler/, 'reb'],
    [/condenser/, 'cond'],
    [/reactor/, 'r'],
    [/rectif/, 'rect'],
    [/strip/, 'strip'],
    [/absor/, 'abs'],
    [/extract/, 'extr'],
    [/scrub/, 'scrub'],
    [/distil|column|tower/, 'dist'],
    [/flash/, 'flash'],
    [/hydrocyclone/, 'hcycl'],
    [/cyclone/, 'cycl'],
    [/centrifug/, 'centr'],
    [/gas clean/, 'egclean'],
    [/separat|settler|decant/, 'sep'],
    [/gas filter/, 'gfil'],
    [/blower/, 'blwr'],
    [/orifice/, 'orif'],
  ]
  for (const [re, u] of byLabel) if (re.test(words)) return u
  const cls = p.class ?? classOf(p, scene) ?? ''
  if (/Pump$/.test(cls) || p.kind === 'pump') return 'pp'
  if (cls === 'Compressor' || p.kind === 'heatpump') return 'comp'
  if (cls === 'Fan' || p.kind === 'fan') return 'blwr'
  if (cls === 'Turbine' || p.kind === 'turbine') return 'turb'
  if (cls === 'HeatExchanger' || p.kind === 'radiator') return 'hex'
  if (cls === 'Filter' || p.kind === 'treatment') return 'lfil'
  if (/Valve$/.test(cls) || p.kind === 'valve' || r === 'gate') return 'v'
  if (cls === 'Tank' || r === 'storage') return 'tank'
  if (cls === 'Vessel') return 'sep'
  if (r === 'converter') return /heat|hot/.test(words) ? 'hex' : 'r'
  if (outs > 1) return 'splt'
  if (ins > 1) return 'mix'
  return 'pipe'
}

type Item = string | { unit: string; after: Item[] }

const render = (items: Item[]): string =>
  items
    .map((i) => (typeof i === 'string' ? i : `(${i.unit})${render(i.after)}`))
    .join('')

/**
 * a scene's process streams as an SFILES 2.0 string. Streams are the links a
 * PFD draws (water, heat and fuel), losses left out; a part on none of them
 * isn't written.
 */
export function toSfiles(scene: Scene): { sfiles: string; notes: string[] } {
  const notes: string[] = []
  const shows = new Set(PACKS.pfd!.shows)
  const byId = new Map(scene.parts.map((p) => [p.id, p]))
  const succ = new Map<string, string[]>()
  const pred = new Map<string, number>()
  let skipped = 0
  for (const l of scene.links) {
    if (!shows.has(l.domain) || l.loss) {
      skipped++
      continue
    }
    if (!byId.has(l.from) || !byId.has(l.to) || l.from === l.to) continue
    const s = succ.get(l.from) ?? []
    if (s.includes(l.to)) continue
    s.push(l.to)
    succ.set(l.from, s)
    if (!succ.has(l.to)) succ.set(l.to, [])
    pred.set(l.to, (pred.get(l.to) ?? 0) + 1)
  }
  const ids = scene.parts.map((p) => p.id).filter((id) => succ.has(id))
  if (!ids.length)
    throw new Error(
      'nothing to write: SFILES describes process streams, and no water, heat or fuel flows between two parts here',
    )
  if (skipped)
    notes.push(
      `${skipped} link(s) that a PFD doesn't draw (power, signals, losses) left out`,
    )
  const left = scene.parts.length - ids.length
  if (left) notes.push(`${left} part(s) on no process stream left out`)

  const unit = new Map(
    ids.map((id) => [
      id,
      unitOf(byId.get(id)!, scene, pred.get(id) ?? 0, succ.get(id)!.length),
    ]),
  )
  const written = new Map<
    string,
    { tok: { unit: string; after: Item[] }; seq: number }
  >()
  let joins = 0
  const join = (from: { after: Item[] }, to: string) => {
    const n = ++joins
    const num = n > 9 ? `%${n}` : String(n)
    from.after.push(num)
    written.get(to)!.tok.after.push(`<${num}`)
  }
  let seqNo = 0
  /** the main line of a later flowsheet joins this unit, if any */
  let into: string | undefined

  const walk = (id: string, main: boolean): Item[] => {
    const tok = { unit: unit.get(id)!, after: [] as Item[] }
    written.set(id, { tok, seq: seqNo })
    const items: Item[] = [tok]
    const next = succ.get(id)!
    let lastBranch = -1
    next.forEach((s, i) => {
      const done = written.get(s)
      const more = next.slice(i + 1).some((t) => !written.has(t))
      if (done) {
        // the main line of a later flowsheet ending in an earlier one
        // reads better as an incoming branch there than as a numbered join
        if (
          main &&
          !more &&
          seqNo > 0 &&
          done.seq < seqNo &&
          into === undefined
        )
          into = s
        else join(tok, s)
      } else if (more) {
        lastBranch = items.length
        items.push('[', ...walk(s, false), ']')
      } else {
        lastBranch = -1
        items.push(...walk(s, main))
      }
    })
    // a branch that turned out to be the last thing here is the main line
    if (lastBranch >= 0 && items.at(-1) === ']') {
      items.splice(items.length - 1, 1)
      items.splice(lastBranch, 1)
    }
    return items
  }

  const roots = [
    ...ids.filter((id) => !pred.get(id)),
    ...ids.filter((id) => pred.get(id)),
  ]
  const out: Item[] = []
  for (const r of roots) {
    if (written.has(r)) continue
    into = undefined
    const items = walk(r, true)
    if (into !== undefined)
      written.get(into)!.tok.after.push('<&|', ...items, '&|')
    else out.push(...(out.length ? ['n|'] : []), ...items)
    seqNo++
  }
  return { sfiles: render(out), notes }
}
