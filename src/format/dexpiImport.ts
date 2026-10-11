// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { isIsaTag } from '../sim/instruments.ts'
import type {
  Behaviour,
  Domain,
  InstrumentMounting,
  InstrumentSpec,
  Knob,
  LinkSpec,
  PartSpec,
  Scene,
  Switch,
  TitleBlock,
} from '../sim/types.ts'
import { autoLayout } from '../view/autoLayout.ts'
import { lintLayout } from '../view/lint.ts'
import { validateScene } from './validate.ts'
import { descendants, kid, kids, parseXml } from './xml.ts'
import type { XmlNode } from './xml.ts'

/*
 * A P&ID from plant design software, opened as a living sheet: DEXPI 1.3
 * (Proteus 4.x) XML in, an Anigram scene out. Read from the published
 * specification and its public example drawings; no DEXPI library code is
 * used.
 *
 * What comes across is the plant: equipment with its tags, every piping
 * segment as links from nozzle to nozzle with its valves in place, off-page
 * connectors and open line ends as where flow enters and leaves the sheet,
 * and the instrument loops with the valves they drive. Fittings that only
 * join pipe (flanges, reducers) are passed through.
 *
 * Two things a DEXPI file doesn't say are guessed, and the notes say so:
 *
 * - Where things go on the grid. Each part keeps its place relative to the
 *   others: positions are ranked into columns and rows, so things the
 *   drawing lines up stay lined up.
 * - How it behaves. Each class gets the behaviour such things usually have:
 *   a pump passes up to its duty and can be stopped, a hand valve can be
 *   shut, a control valve follows a slider, a tank stores, an exchanger's
 *   utility side (a line from off the sheet, through it, and off again) is
 *   drawn as heat it takes from or gives to the process. What enters is a
 *   supply, what leaves is a demand, all scaled by one throughput slider.
 */

export interface DexpiImport {
  scene: Scene
  /** what didn't come across or was guessed, in words */
  notes: string[]
  counts: {
    equipment: number
    valves: number
    lines: number
    instruments: number
    /** fittings passed through: flanges, reducers and the like */
    fittings: number
  }
}

export interface DexpiImportOptions {
  /** the scene's id; from the drawing's name when left out */
  id?: string
  /**
   * where parts go: `drawing` keeps the file's own arrangement, `flow` lays
   * the sheet out by its flow (as auto_layout does). By default, whichever
   * reads more cleanly.
   */
  layout?: 'drawing' | 'flow'
}

/** the nominal flow the guessed behaviours are sized from, in m³/h */
const Q = 60

type Node = {
  id: string
  xml?: XmlNode
  /** DEXPI's class, as written */
  dexpi: string
  what: 'equipment' | 'piping' | 'offpage' | 'open'
  /** the P&ID class Anigram draws it as, if it has one */
  cls?: string
  pos?: [number, number]
  tag?: string
  label: string
  /** fittings that only join pipe, and blind ends */
  passThrough?: boolean
  /** an off-page connector's direction, when its class says */
  enters?: boolean
}

type Edge = {
  from: string
  to: string
  line?: string
  domain: Domain
  loss?: boolean
}

// ------------------------------------------------------------ reading XML

/** a component's DEXPI attributes by name, every set merged */
function attrsOf(n: XmlNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const set of kids(n, 'GenericAttributes'))
    for (const a of kids(set, 'GenericAttribute'))
      if (a.attrs.Name && a.attrs.Value !== undefined)
        out[a.attrs.Name] = a.attrs.Value
  return out
}

function positionOf(n: XmlNode): [number, number] | undefined {
  const loc = kid(kid(n, 'Position') ?? n, 'Location')
  if (!loc) return undefined
  const x = Number(loc.attrs.X)
  const y = Number(loc.attrs.Y)
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined
}

const associations = (n: XmlNode, type: string) =>
  kids(n, 'Association')
    .filter((a) => a.attrs.Type === type && a.attrs.ItemID)
    .map((a) => a.attrs.ItemID!)

/** "CentrifugalPump" → "centrifugal pump" */
const words = (cls: string) =>
  cls
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// --------------------------------------------------------- what is what

/** DEXPI equipment classes as Anigram's P&ID classes, most specific first */
function equipmentClass(c: string): string | undefined {
  if (/Pump$/.test(c))
    return /Centrifugal|Axial|Jet/.test(c) || c === 'Pump'
      ? 'CentrifugalPump'
      : 'PositiveDisplacementPump'
  if (/Compressor$/.test(c)) return 'Compressor'
  if (/(Fan|Blower)$/.test(c)) return 'Fan'
  if (/HeatExchanger$|Cooler$|Heater$|Condenser$|Evaporator$|Reboiler$/.test(c))
    return 'HeatExchanger'
  if (/(Filter|Strainer)$/.test(c)) return 'Filter'
  if (/^(Tank|Silo|Basin|Pit)$|Tank$/.test(c)) return 'Tank'
  if (/Vessel$|Column$|Drum$|Reactor$|Separator$|Tower$/.test(c))
    return 'Vessel'
  if (/Motor$/.test(c)) return 'ElectricMotor'
  if (/Turbine$/.test(c)) return 'Turbine'
  return undefined
}

/** DEXPI piping classes as Anigram's, or 'pass' for a fitting that only joins pipe */
function pipingClass(c: string): string | 'pass' | undefined {
  if (
    /SafetyValve|ReliefValve|SafetyValveOrFitting|BurstingDisc|RuptureDisc/.test(
      c,
    )
  )
    return 'SafetyValve'
  if (/CheckValve$|NonReturnValve$/.test(c)) return 'CheckValve'
  if (/ButterflyValve$/.test(c)) return 'ButterflyValve'
  if (/BallValve$|PlugValve$/.test(c)) return 'BallValve'
  if (/GateValve$|KnifeValve$/.test(c)) return 'GateValve'
  if (
    /GlobeValve$|NeedleValve$|AngleValve$|DiaphragmValve$|OperatedValve$/.test(
      c,
    )
  )
    return 'GlobeValve'
  if (/Valve$/.test(c)) return 'GateValve'
  if (/Tee$|Cross$|Header$/.test(c)) return 'Junction'
  if (
    /Flange$|Reducer$|Fitting$|Coupling$|Orifice$|Spectacle|Blind|Plug$|Cap$|Hose$|Elbow$|Bend$|Union$|Spool$|Sleeve$|Funnel$|SightGlass$|Silencer$|Steam ?Trap$|Expansion|Compensator$/.test(
      c,
    )
  )
    return 'pass'
  return undefined
}

/** the pictorial glyph each class is drawn with when the sheet is viewed as a picture */
const KIND: Record<string, string> = {
  CentrifugalPump: 'pump',
  PositiveDisplacementPump: 'pump',
  Compressor: 'fan',
  Fan: 'fan',
  Tank: 'reservoir',
  Vessel: 'hottank',
  HeatExchanger: 'radiator',
  Filter: 'treatment',
  ElectricMotor: 'generator',
  Turbine: 'turbine',
  Junction: 'manifold',
  GateValve: 'valve',
  GlobeValve: 'valve',
  BallValve: 'valve',
  ButterflyValve: 'valve',
  CheckValve: 'valve',
  ControlValve: 'valve',
  SafetyValve: 'valve',
}

const MOUNTING: Record<string, InstrumentMounting> = {
  Field: 'field',
  CentralLocation: 'panel',
  LocalPanel: 'panel',
  AuxiliaryLocation: 'behind-panel',
}

// ----------------------------------------------------------------- import

export function fromDexpi(
  src: string,
  opts: DexpiImportOptions = {},
): DexpiImport {
  const root = parseXml(src)
  if (root.name !== 'PlantModel')
    throw new Error(
      `this is <${root.name}>, not a DEXPI file: a DEXPI P&ID is Proteus XML whose root is <PlantModel>`,
    )
  const notes: string[] = []
  // the shape catalogue holds symbol drawings, not plant
  const all = [
    ...descendants({
      ...root,
      children: root.children.filter((c) => c.name !== 'ShapeCatalogue'),
    }),
  ]
  const byId = new Map<string, XmlNode>()
  for (const n of all) if (n.attrs.ID) byId.set(n.attrs.ID, n)

  // ---- equipment and its nozzles
  const nodes = new Map<string, Node>()
  const nozzleOf = new Map<string, string>()
  const insides = new Set<XmlNode>()
  const skippedEquipment: string[] = []
  const visitEquipment = (n: XmlNode, owner?: string) => {
    for (const c of n.children) {
      if (c.name === 'Nozzle' && c.attrs.ID && owner)
        nozzleOf.set(c.attrs.ID, owner)
      if (c.name === 'Equipment') {
        insides.add(c)
        visitEquipment(c, owner)
      }
    }
  }
  for (const n of all) {
    if (n.name !== 'Equipment' || insides.has(n) || !n.attrs.ID) continue
    const dexpi = n.attrs.ComponentClass ?? 'Equipment'
    const a = attrsOf(n)
    const tag = tagOf(a)
    const cls = equipmentClass(dexpi)
    nodes.set(n.attrs.ID, {
      id: n.attrs.ID,
      xml: n,
      dexpi,
      what: 'equipment',
      cls,
      pos: positionOf(n),
      tag,
      // ComponentName is often the symbol's name in the shape catalogue
      label:
        a.EquipmentDescriptionAssignmentClass ??
        (n.attrs.ComponentName &&
        !/_SHAPE$|^[A-Z0-9_]+$/.test(n.attrs.ComponentName)
          ? n.attrs.ComponentName
          : capital(words(dexpi))),
    })
    if (!cls) skippedEquipment.push(`${tag ?? n.attrs.ID} (${words(dexpi)})`)
    visitEquipment(n, n.attrs.ID)
  }
  if (skippedEquipment.length)
    notes.push(
      `no P&ID symbol for ${skippedEquipment.join(', ')}, so each is drawn as a labelled box`,
    )

  // ---- piping: each segment's chain from end to end
  type Chain = {
    segment?: string
    ids: string[]
    line?: string
    open: [boolean, boolean]
  }
  const chains: Chain[] = []
  let fittings = 0
  let openEnds = 0
  const lineNumbers = new Set<string>()
  const openNode = (pos: [number, number] | undefined, enters: boolean) => {
    const id = `open-${++openEnds}`
    nodes.set(id, {
      id,
      dexpi: enters
        ? 'FlowInPipeOffPageConnector'
        : 'FlowOutPipeOffPageConnector',
      what: 'open',
      cls: 'OffPageConnector',
      pos,
      label: enters ? 'In' : 'Out',
      enters,
    })
    return id
  }
  for (const sys of all.filter((n) => n.name === 'PipingNetworkSystem')) {
    const sa = attrsOf(sys)
    const line = lineTagOf(sa)
    if (line) lineNumbers.add(line)
    for (const seg of descendants(sys)) {
      if (seg.name !== 'PipingNetworkSegment') continue
      const ids: string[] = []
      for (const c of seg.children) {
        if (!c.attrs.ID) continue
        if (c.name === 'PipingComponent' || c.name === 'PipeOffPageConnector') {
          const dexpi = c.attrs.ComponentClass ?? c.name
          if (!nodes.has(c.attrs.ID)) {
            const a = attrsOf(c)
            const isOff = c.name === 'PipeOffPageConnector'
            const cls = isOff ? 'OffPageConnector' : pipingClass(dexpi)
            if (cls === 'pass') fittings++
            nodes.set(c.attrs.ID, {
              id: c.attrs.ID,
              xml: c,
              dexpi,
              what: isOff ? 'offpage' : 'piping',
              cls: cls === 'pass' ? undefined : cls,
              passThrough: cls === 'pass',
              pos: positionOf(c),
              tag: isOff ? undefined : a.PipingComponentNumberAssignmentClass,
              label: isOff
                ? (a.PipeOffPageConnectorNameAssignmentClass ??
                  a.PipeConnectorNumberAssignmentClass ??
                  (/FlowIn/.test(dexpi) ? 'From elsewhere' : 'To elsewhere'))
                : capital(words(dexpi)),
              enters: /FlowIn/.test(dexpi)
                ? true
                : /FlowOut/.test(dexpi)
                  ? false
                  : undefined,
            })
            if (!cls)
              notes.push(
                `${c.attrs.ID}: no P&ID symbol for a ${words(dexpi)}, so it is passed through`,
              )
            if (!cls) nodes.get(c.attrs.ID)!.passThrough = true
          }
          ids.push(c.attrs.ID)
        }
      }
      const conn = kid(seg, 'Connection')
      const pts = kids(seg, 'CenterLine').flatMap((cl) =>
        kids(cl, 'Coordinate').map(
          (p) => [Number(p.attrs.X), Number(p.attrs.Y)] as [number, number],
        ),
      )
      const ref = (id: string | undefined) =>
        id && (nodes.has(id) || nozzleOf.has(id) || byId.has(id))
          ? id
          : undefined
      let from = ref(conn?.attrs.FromID)
      let to = ref(conn?.attrs.ToID)
      const open: [boolean, boolean] = [false, false]
      if (!from && !ids.length) {
        from = openNode(pts[0], true)
        open[0] = true
      } else if (!from && !(ids[0] && nodes.get(ids[0])?.what === 'offpage')) {
        from = openNode(pts[0], true)
        open[0] = true
      }
      if (!to && !(ids.at(-1) && nodes.get(ids.at(-1)!)?.what === 'offpage')) {
        to = openNode(pts.at(-1), false)
        open[1] = true
      }
      const chain = [from, ...ids, to].filter((x): x is string => !!x)
      chains.push({
        segment: seg.attrs.ID,
        ids: chain.filter((x, i) => x !== chain[i - 1]),
        line,
        open,
      })
    }
  }

  /** a chain id as the node it stands for: a nozzle is its equipment */
  const resolve = (id: string): string | undefined =>
    nodes.has(id) ? id : nozzleOf.get(id)

  // ---- edges between the parts that are kept, fittings passed through
  const edges: Edge[] = []
  const edgeKey = new Set<string>()
  /** where a fitting that is passed through went: the part beside it */
  const standIn = new Map<string, string>()
  /** the parts each segment and each piping system runs through */
  const onSegment = new Map<string, string[]>()
  /** parts whose line ends in a blind flange or cap */
  const blanked = new Set<string>()
  let unknownRefs = 0
  // the pipe as drawn, fittings and all, then with the fittings passed
  // through: a reducer joining two segments joins what is either side of it
  const raw = new Map<string, Array<{ to: string; line?: string }>>()
  const rawIn = new Map<string, string[]>()
  for (const c of chains) {
    const resolved = c.ids.flatMap((r) => {
      const id = resolve(r)
      if (!id) unknownRefs++
      return id ? [id] : []
    })
    const path = resolved.filter((id, i) => id !== resolved[i - 1])
    if (c.segment)
      onSegment.set(
        c.segment,
        path.filter((id) => !nodes.get(id)!.passThrough),
      )
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!]
      raw.set(a, [...(raw.get(a) ?? []), { to: b, line: c.line }])
      rawIn.set(b, [...(rawIn.get(b) ?? []), a])
    }
  }
  const through = (id: string) => !!nodes.get(id)?.passThrough
  for (const a of nodes.keys()) {
    if (through(a)) continue
    const seen = new Set<string>()
    const walk = (x: string, line?: string) => {
      const next = raw.get(x) ?? []
      // a fitting the line stops at: a blind flange, a cap
      if (
        x !== a &&
        !next.length &&
        /Blind|Cap$|Plug$/.test(nodes.get(x)!.dexpi)
      )
        blanked.add(a)
      for (const e of next) {
        if (seen.has(e.to)) continue
        seen.add(e.to)
        if (through(e.to)) {
          walk(e.to, line ?? e.line)
          continue
        }
        if (e.to === a || edgeKey.has(`${a}>${e.to}`)) continue
        edgeKey.add(`${a}>${e.to}`)
        edges.push({ from: a, to: e.to, line: e.line ?? line, domain: 'water' })
      }
    }
    walk(a)
  }
  // a fitting passed through stands in for the part before it, or after
  for (const id of nodes.keys()) {
    if (!through(id)) continue
    const find = (step: (x: string) => string[]) => {
      const seen = new Set([id])
      const todo = [id]
      while (todo.length) {
        for (const y of step(todo.shift()!)) {
          if (seen.has(y)) continue
          if (!through(y)) return y
          seen.add(y)
          todo.push(y)
        }
      }
      return undefined
    }
    const near =
      find((x) => rawIn.get(x) ?? []) ??
      find((x) => (raw.get(x) ?? []).map((e) => e.to))
    if (near) standIn.set(id, near)
  }
  if (unknownRefs)
    notes.push(
      `${unknownRefs} pipe ends name something the file doesn't contain; those ends are left loose`,
    )

  // ---- an exchanger's utility side: a line in from off the sheet, through
  //      it, and off again, is heat it takes from or gives to the process
  const ins = (id: string) => edges.filter((e) => e.to === id)
  const outs = (id: string) => edges.filter((e) => e.from === id)
  const offSheet = (id: string) => {
    const w = nodes.get(id)!.what
    return w === 'open' || w === 'offpage'
  }
  /** the run of edges from `e` away from the exchanger, through valves only, to an off-sheet end */
  const runToEdge = (e: Edge, up: boolean): Edge[] | undefined => {
    const run = [e]
    for (let hops = 0; hops < 20; hops++) {
      const far = up ? run.at(-1)!.from : run.at(-1)!.to
      if (offSheet(far)) return run
      const n = nodes.get(far)!
      if (n.what !== 'piping') return undefined
      const next = up ? ins(far) : outs(far)
      const back = up ? outs(far) : ins(far)
      if (next.length !== 1 || back.length !== 1) return undefined
      run.push(next[0]!)
    }
    return undefined
  }
  const vents = new Set<string>()
  const exchangers = new Map<string, { process: Domain; utility: Domain }>()
  for (const n of nodes.values()) {
    if (n.cls !== 'HeatExchanger') continue
    const upRuns = ins(n.id).map((e) => runToEdge(e, true))
    const downRuns = outs(n.id).map((e) => runToEdge(e, false))
    const util = upRuns.findIndex(Boolean)
    const utilOut = downRuns.findIndex(Boolean)
    const processIn = ins(n.id).length - (util >= 0 ? 1 : 0)
    const processOut = outs(n.id).length - (utilOut >= 0 ? 1 : 0)
    if (util < 0 || utilOut < 0 || processIn < 1 || processOut < 1) continue
    for (const e of upRuns[util]!) e.domain = 'heat'
    for (const e of downRuns[utilOut]!) e.domain = 'heat'
    outs(n.id)[utilOut]!.loss = true
    vents.add(downRuns[utilOut]!.at(-1)!.to)
    exchangers.set(n.id, { process: 'water', utility: 'heat' })
  }
  if (exchangers.size)
    notes.push(
      `${exchangers.size === 1 ? 'one exchanger' : `${exchangers.size} exchangers`}: the utility side (a line from off the sheet, through it and off again) is drawn as heat taken from the process, a tenth of the flow it passes`,
    )

  // ---- the parts, with guessed behaviours
  const used = new Set<string>()
  for (const e of edges) {
    used.add(e.from)
    used.add(e.to)
  }
  const lonely = [...nodes.values()].filter(
    (n) => !used.has(n.id) && !n.passThrough && n.what !== 'open',
  )
  if (lonely.length)
    notes.push(
      `${lonely.map((n) => n.tag ?? n.id).join(', ')}: no pipe reaches ${lonely.length === 1 ? 'it' : 'them'}, so ${lonely.length === 1 ? 'it is' : 'they are'} left out`,
    )
  const kept = [...nodes.values()].filter((n) => used.has(n.id))
  if (!kept.length)
    throw new Error(
      'no pipe in this DEXPI file joins anything, so there is nothing to animate: Anigram opens P&IDs whose equipment is connected by piping',
    )

  // which valves an instrument drives, found before behaviours are set
  const drivenBy = actuatedValves(all, byId, resolve)

  // a valve's number is a tag only when it reads like one and is unique:
  // many files number valves within their line (C1, C2 on every line)
  const valveNumbers = new Map<string, number>()
  for (const n of nodes.values())
    if (n.what === 'piping' && n.tag)
      valveNumbers.set(n.tag, (valveNumbers.get(n.tag) ?? 0) + 1)
  for (const n of nodes.values())
    if (
      n.what === 'piping' &&
      n.tag &&
      (valveNumbers.get(n.tag)! > 1 ||
        !/^([A-Z]{1,4}-\d{2,}|[A-Z]{2,4}\d{2,})/.test(n.tag))
    )
      n.tag = undefined

  const ids = new Map<string, string>()
  const taken = new Set<string>()
  const tagsTaken = new Set<string>()
  for (const n of kept) {
    const base =
      slug(n.tag ?? (n.cls ? words(n.cls) : words(n.dexpi))) || 'part'
    let id = base
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`
    taken.add(id)
    ids.set(n.id, id)
  }

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
  const guessed = new Set<string>()
  const parts: PartSpec[] = kept.map((n) => {
    const id = ids.get(n.id)!
    const ins_ = ins(n.id)
    const outs_ = outs(n.id)
    const driven = drivenBy.get(n.id)
    let cls = n.cls
    if (driven && n.what === 'piping' && cls !== 'SafetyValve')
      cls = 'ControlValve'
    let tag = n.tag
    if (driven?.number) tag = isaPartTag(driven.number)
    if (tag && tagsTaken.has(tag)) tag = undefined
    if (tag) tagsTaken.add(tag)
    const behaviour = guessBehaviour(n, cls, {
      id,
      ins: ins_,
      outs: outs_,
      vent: vents.has(n.id),
      blanked: blanked.has(n.id),
      exchanger: exchangers.get(n.id),
      switches,
      knobs,
      tag,
    })
    guessed.add(behaviour.role)
    const part: PartSpec = {
      id,
      kind: KIND[cls ?? ''] ?? defaultKind(behaviour),
      label: n.label,
      at: [0, 0],
      behaviour,
      note: `${capital(words(n.dexpi))} in the DEXPI file (${n.id}).`,
    }
    if (cls) part.class = cls
    if (tag) part.tag = tag
    const sw = switches.find((s) => s.id === id)
    if (sw) part.toggles = sw.id
    return part
  })

  const links: LinkSpec[] = edges.map((e) => {
    const l: LinkSpec = {
      from: ids.get(e.from)!,
      to: ids.get(e.to)!,
      domain: e.domain,
    }
    if (e.line) l.tag = e.line
    if (e.loss) l.loss = true
    return l
  })

  // ---- instruments
  const posOf = new Map(kept.map((n) => [n.id, n.pos]))
  /** the part an instrument is on: a component, a nozzle's equipment, or the nearest part on a pipe */
  const locate = (ref: string, near?: [number, number]): string | undefined => {
    const r = resolve(ref)
    const direct = r && ids.has(r) ? r : r && standIn.get(r)
    if (direct) return ids.get(direct)
    const sys = byId.get(ref)
    const segs =
      sys?.name === 'PipingNetworkSystem'
        ? [...descendants(sys)].filter((d) => d.name === 'PipingNetworkSegment')
        : [sys].filter((d) => d?.name === 'PipingNetworkSegment')
    const on = segs.flatMap((d) => onSegment.get(d!.attrs.ID ?? '') ?? [])
    if (!on.length) return undefined
    const d = (id: string) => {
      const p = posOf.get(id)
      return p && near ? Math.hypot(p[0] - near[0], p[1] - near[1]) : 0
    }
    return ids.get(on.reduce((a, b) => (d(b) < d(a) ? b : a)))
  }
  const instruments = readInstruments(all, byId, locate, ids, drivenBy, notes)
  for (const x of instruments) {
    if (tagsTaken.has(x.tag)) {
      notes.push(
        `${x.tag}: a part already has that tag, so the instrument is left out`,
      )
      x.tag = ''
    }
    tagsTaken.add(x.tag)
  }
  const keptInstruments = instruments.filter((x) => x.tag)

  // ---- the grid
  const spots: Array<{
    pos?: [number, number]
    set: (c: [number, number]) => void
  }> = [
    ...kept.map((n, i) => ({
      pos: n.pos,
      set: (c: [number, number]) => (parts[i]!.at = c),
    })),
    ...keptInstruments.map((x) => ({
      pos: x.pos,
      set: (c: [number, number]) => (x.spec.at = c),
    })),
  ]
  fillMissing(spots, kept, edges)
  const size = placeOnGrid(spots)

  // ---- the sheet
  const meta = all.find((n) => n.name === 'MetaData')
  const m = meta ? attrsOf(meta) : {}
  const drawingEl = all.find((n) => n.name === 'Drawing')
  const title =
    m.DrawingNameAssignmentClass ??
    drawingEl?.attrs.Title ??
    drawingEl?.attrs.Name ??
    'Imported P&ID'
  const titleBlock: TitleBlock = {}
  const tb = (k: keyof TitleBlock, v: string | undefined) => {
    if (v) titleBlock[k] = v
  }
  tb('owner', m.EnterpriseNameAssignmentClass)
  tb('project', m.ProjectNameAssignmentClass)
  tb('drawnBy', m.DrafterNameAssignmentClass ?? m.CreatorNameAssignmentClass)
  tb('checkedBy', m.CheckerNameAssignmentClass)
  tb('approvedBy', m.ApproverNameAssignmentClass)
  tb('issued', isoDate(m.CreationDateRepresentationAssignmentClass))
  tb('revision', m.RevisionNumberAssignmentClass)
  tb('status', m.ApprovalDescriptionAssignmentClass)

  const equipment = kept.filter((n) => n.what === 'equipment').length
  const valves = kept.filter(
    (n) => n.what === 'piping' && n.cls !== 'Junction',
  ).length
  const scene: Scene = {
    anigram: 1,
    id: opts.id ?? (slug(title) || 'dexpi-import'),
    title,
    subtitle:
      m.DrawingSubTitleAssignmentClass ??
      `Imported from DEXPI: ${equipment} equipment, ${valves} valves, ${lineNumbers.size} lines`,
    sheet: m.DrawingNumberAssignmentClass ?? drawingEl?.attrs.Name ?? 'DEXPI',
    drawing: 'pid',
    ...(Object.keys(titleBlock).length ? { titleBlock } : {}),
    size,
    units: {
      water: { rate: 'm³/h', amount: 'm³' },
      heat: { rate: 'kW', amount: 'kWh' },
    },
    scale: { water: 2 * Q, heat: Q },
    parts,
    links,
    ...(keptInstruments.length
      ? { instruments: keptInstruments.map((x) => x.spec) }
      : {}),
    knobs,
    ...(switches.length ? { switches } : {}),
    clock: { start: 6, rate: 1 },
  }
  notes.push(
    `behaviours are guessed from each class (supplies of ${Q * 1.5} m³/h in, demands of ${Q} m³/h out, pumps rated ${Q * 1.5} m³/h): set real duties and demands before trusting a number`,
  )
  // the file's arrangement, or one by the flow, whichever reads better
  const asDrawn = validateScene(structuredClone(scene)).scene
  if (asDrawn && opts.layout !== 'drawing') {
    const byFlow = autoLayout(asDrawn).scene
    const drawnFindings = lintLayout(asDrawn).length
    const flowFindings = lintLayout(byFlow).length
    if (opts.layout === 'flow' || flowFindings < drawnFindings) {
      const at = new Map(byFlow.parts.map((p) => [p.id, p.at]))
      for (const p of scene.parts) p.at = at.get(p.id) ?? p.at
      for (const l of scene.links) delete l.via
      const iat = new Map((byFlow.instruments ?? []).map((x) => [x.tag, x.at]))
      for (const x of scene.instruments ?? []) x.at = iat.get(x.tag) ?? x.at
      scene.size = byFlow.size
      if (!opts.layout)
        notes.push(
          `laid out by its flow, which reads more cleanly here than the file's own arrangement (${flowFindings} layout findings against ${drawnFindings}); pass layout "drawing" to keep the file's`,
        )
    }
  }
  if (!parts.some((p) => p.behaviour.role === 'sink'))
    notes.push(
      'nothing on the sheet takes flow away, so it only moves while tanks fill',
    )
  return {
    scene,
    notes,
    counts: {
      equipment,
      valves,
      lines: lineNumbers.size,
      instruments: keptInstruments.length,
      fittings,
    },
  }
}

// ------------------------------------------------------------ the pieces

function tagOf(a: Record<string, string>): string | undefined {
  const prefix = a.TagNamePrefixAssignmentClass
  const seq = a.TagNameSequenceNumberAssignmentClass
  if (prefix && seq)
    return `${prefix}-${seq}${a.TagNameSuffixAssignmentClass ?? ''}`
  return a.TagNameAssignmentClass || undefined
}

/** a line's number, with its size and fluid in front when the file gives them apart */
function lineTagOf(a: Record<string, string>): string | undefined {
  const num = a.LineNumberAssignmentClass
  if (!num) return undefined
  if (/^\d/.test(num) && num.includes('-')) return num
  const dn = a.NominalDiameterNumericalValueRepresentationAssignmentClass
  const fluid = a.FluidCodeAssignmentClass
  return dn && fluid ? `${dn}-${fluid}-${num}` : num
}

/** an actuated valve's number as a part tag: "PV4712.02" → "PV-4712.02" */
const isaPartTag = (n: string) => n.replace(/^([A-Z]+)-?/, '$1-')

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

function isoDate(s: string | undefined): string | undefined {
  if (!s) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

function defaultKind(b: Behaviour): string {
  switch (b.role) {
    case 'source':
      return 'well'
    case 'sink':
      return 'tap'
    case 'vent':
      return 'sky'
    case 'storage':
      return 'reservoir'
    case 'gate':
      return 'valve'
    default:
      return 'manifold'
  }
}

function guessBehaviour(
  n: Node,
  cls: string | undefined,
  ctx: {
    id: string
    ins: Edge[]
    outs: Edge[]
    vent: boolean
    blanked: boolean
    exchanger?: { process: Domain; utility: Domain }
    switches: Switch[]
    knobs: Knob[]
    tag?: string
  },
): Behaviour {
  const name = ctx.tag ?? n.label
  if (n.what === 'offpage' || n.what === 'open') {
    const enters = n.enters ?? (!ctx.ins.length && ctx.outs.length > 0)
    if (enters) return { role: 'source', output: 1.5 * Q }
    if (ctx.vent || ctx.ins.every((e) => e.domain === 'heat'))
      return { role: 'vent' }
    return { role: 'sink', demand: `${Q} * knob('throughput')` }
  }
  if (ctx.exchanger)
    return {
      role: 'converter',
      output: ctx.exchanger.process,
      recipe: { [ctx.exchanger.process]: 1, [ctx.exchanger.utility]: 0.1 },
    }
  switch (cls) {
    case 'CentrifugalPump':
    case 'PositiveDisplacementPump':
    case 'Compressor':
    case 'Fan':
      ctx.switches.push({ id: ctx.id, label: `${name} running`, on: true })
      return {
        role: 'gate',
        capacity: 1.5 * Q,
        open: `on('${ctx.id}') ? 1 : 0`,
      }
    case 'Tank':
    case 'Vessel':
      return {
        role: 'storage',
        capacity: 4 * Q,
        start: 0.5,
        maxIn: 2 * Q,
        maxOut: 2 * Q,
      }
    case 'GateValve':
    case 'GlobeValve':
    case 'BallValve':
    case 'ButterflyValve':
      // a valve the line ends at: a drain or vent, shut until opened; one
      // before a blind flange can't pass anything at all
      if (!ctx.outs.length && ctx.ins.length) {
        if (ctx.blanked) return { role: 'sink', demand: 0 }
        ctx.switches.push({ id: ctx.id, label: `${name} open`, on: false })
        return { role: 'sink', demand: `on('${ctx.id}') ? ${Q / 4} : 0` }
      }
      ctx.switches.push({ id: ctx.id, label: `${name} open`, on: true })
      return { role: 'gate', capacity: 3 * Q, open: `on('${ctx.id}') ? 1 : 0` }
    case 'ControlValve': {
      const knob = `${ctx.id}-opening`
      ctx.knobs.push({
        id: knob,
        label: `${name} opening`,
        value: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        format: '{pct}%',
      })
      return { role: 'gate', capacity: 3 * Q, open: `knob('${knob}')` }
    }
    case 'CheckValve':
      return { role: 'gate', capacity: 3 * Q }
    case 'SafetyValve':
      // it lifts on pressure, which the sheet doesn't model; it stays shut
      return { role: 'gate', capacity: 3 * Q, open: 0 }
    default:
      return { role: 'bus' }
  }
}

/** valve node id → the actuating function that drives it */
function actuatedValves(
  all: XmlNode[],
  byId: Map<string, XmlNode>,
  resolve: (id: string) => string | undefined,
): Map<string, { number?: string; functionId: string }> {
  const out = new Map<string, { number?: string; functionId: string }>()
  for (const af of all.filter((n) => n.name === 'ActuatingFunction')) {
    const number = attrsOf(af).ActuatingFunctionNumberAssignmentClass
    for (const sysId of associations(af, 'is fulfilled by')) {
      const sys = byId.get(sysId)
      if (!sys) continue
      for (const c of descendants(sys))
        for (const v of associations(c, 'refers to')) {
          const valve = resolve(v)
          if (valve) out.set(valve, { number, functionId: af.attrs.ID ?? '' })
        }
    }
  }
  return out
}

function readInstruments(
  all: XmlNode[],
  byId: Map<string, XmlNode>,
  locate: (ref: string, near?: [number, number]) => string | undefined,
  ids: Map<string, string>,
  drivenBy: Map<string, { number?: string; functionId: string }>,
  notes: string[],
): Array<{ tag: string; pos?: [number, number]; spec: InstrumentSpec }> {
  const pifs = all.filter((n) => n.name === 'ProcessInstrumentationFunction')
  // every information flow in the file, wherever it is written
  const flows = new Map<string, { start?: string; end?: string }>()
  for (const f of all.filter((n) => n.name === 'InformationFlow' && n.attrs.ID))
    flows.set(f.attrs.ID!, {
      start: associations(f, 'has logical start')[0],
      end: associations(f, 'has logical end')[0],
    })
  const tagOfPif = new Map<string, string>()
  const used = new Set<string>()
  const read = pifs.map((p, i) => {
    const a = attrsOf(p)
    const cat = (
      a.ProcessInstrumentationFunctionCategoryAssignmentClass ?? 'X'
    ).toUpperCase()
    const fns = (
      a.ProcessInstrumentationFunctionsAssignmentClass ?? ''
    ).toUpperCase()
    const number = (
      a.ProcessInstrumentationFunctionNumberAssignmentClass ?? ''
    ).replace(/[^0-9A-Za-z.]/g, '')
    let tag = `${cat}${fns}`.replace(/[^A-Z]/g, '').slice(0, 5) || 'X'
    tag = `${tag}-${number || 100 + i}`
    if (!isIsaTag(tag)) tag = `${tag.split('-')[0]}-${100 + i}`
    for (let k = 2; used.has(tag); k++)
      tag = `${tag.split('-')[0]}-${number || 100 + i}${String.fromCharCode(64 + k)}`
    used.add(tag)
    if (p.attrs.ID) tagOfPif.set(p.attrs.ID, tag)
    return { p, a, tag }
  })
  const found = read.flatMap(({ p, a, tag }) => {
    const id = p.attrs.ID ?? ''
    const partOf = (ref: string) => locate(ref, positionOf(p))
    const inner = [...descendants(p)]
    // measured on a part: a sensing function located in it, at the far end of a measuring line
    let measures: string | undefined
    for (const [, f] of flows) {
      if (f.end !== id || !f.start) continue
      const start = byId.get(f.start)
      if (!start) continue
      if (start.name === 'ProcessSignalGeneratingFunction') {
        for (const where of associations(start, 'is located in')) {
          measures ??= partOf(where)
        }
      } else if (start.name === 'ProcessInstrumentationFunction') {
        measures ??= tagOfPif.get(f.start)
      }
    }
    // a sensor written inside the bubble, without a flow
    for (const s of inner.filter(
      (n) => n.name === 'ProcessSignalGeneratingFunction',
    ))
      for (const where of associations(s, 'is located in'))
        measures ??= partOf(where)
    // and the valve it drives, through its actuating function
    let drives: string | undefined
    for (const [, f] of flows) {
      if (f.start !== id || !f.end) continue
      for (const [valve, d] of drivenBy)
        if (d.functionId === f.end && ids.has(valve)) drives ??= ids.get(valve)
    }
    if (!measures && drives) measures = drives
    if (!measures) {
      notes.push(
        `${tag}: it isn't joined to anything on the sheet, so it is left out`,
      )
      return []
    }
    const spec: InstrumentSpec = { tag, at: [0, 0], measures }
    if (drives) spec.drives = drives
    const mounting = MOUNTING[a.LocationSpecialization ?? '']
    if (mounting && mounting !== 'field') spec.mounting = mounting
    return [{ tag, pos: positionOf(p), spec }]
  })
  // one reading another that was left out reads what that one would have
  for (let pass = 0; pass < 8; pass++) {
    const tags = new Set(found.map((x) => x.tag))
    const parts = new Set(ids.values())
    const loose = found.filter(
      (x) => !tags.has(x.spec.measures) && !parts.has(x.spec.measures),
    )
    if (!loose.length) break
    for (const x of loose) {
      if (x.spec.drives) x.spec.measures = x.spec.drives
      else {
        notes.push(
          `${x.tag}: what it reads isn't on the sheet, so it is left out`,
        )
        found.splice(found.indexOf(x), 1)
      }
    }
  }
  return found
}

/** a part the file gives no position: halfway between the parts it joins */
function fillMissing(
  spots: Array<{ pos?: [number, number] }>,
  kept: Node[],
  edges: Edge[],
) {
  const at = new Map(kept.map((n, i) => [n.id, i]))
  for (let pass = 0; pass < 4; pass++)
    for (const [i, n] of kept.entries()) {
      if (spots[i]!.pos) continue
      const near = edges
        .filter((e) => e.from === n.id || e.to === n.id)
        .map((e) => spots[at.get(e.from === n.id ? e.to : e.from)!]!.pos)
        .filter((p): p is [number, number] => !!p)
      if (near.length)
        spots[i]!.pos = [
          near.reduce((s, p) => s + p[0], 0) / near.length,
          near.reduce((s, p) => s + p[1], 0) / near.length,
        ]
    }
  for (const s of spots) s.pos ??= [0, 0]
}

/**
 * Ranks every position into columns and rows: things within a few
 * millimetres of each other share one, so a drawing's alignments survive.
 * Two things landing in one cell are moved to the nearest free one.
 */
function placeOnGrid(
  spots: Array<{ pos?: [number, number]; set: (c: [number, number]) => void }>,
): [number, number] {
  const MAX = 40
  const rank = (values: number[]) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b)
    const span = (sorted.at(-1) ?? 0) - (sorted[0] ?? 0)
    for (let tol = Math.max(2, span / 400); ; tol *= 1.4) {
      const of = new Map<number, number>()
      let r = 0
      for (const [i, v] of sorted.entries()) {
        if (i && v - sorted[i - 1]! > tol) r++
        of.set(v, r)
      }
      if (r < MAX || tol > span) return { of, count: r + 1 }
    }
  }
  const xs = rank(spots.map((s) => s.pos![0]))
  // DEXPI's y runs up the sheet, Anigram's rows run down
  const ys = rank(spots.map((s) => -s.pos![1]))
  const taken = new Set<string>()
  let cols = xs.count
  let rows = ys.count
  for (const s of spots) {
    let c = xs.of.get(s.pos![0])!
    let r = ys.of.get(-s.pos![1])!
    if (taken.has(`${c},${r}`)) {
      // the nearest free cell, searching outward ring by ring
      search: for (let d = 1; d < MAX; d++)
        for (let dc = -d; dc <= d; dc++)
          for (const dr of [-d + Math.abs(dc), d - Math.abs(dc)]) {
            const [c2, r2] = [c + dc, r + dr]
            if (c2 < 0 || r2 < 0 || c2 >= MAX || r2 >= MAX) continue
            if (!taken.has(`${c2},${r2}`)) {
              c = c2
              r = r2
              break search
            }
          }
    }
    taken.add(`${c},${r}`)
    cols = Math.max(cols, c + 1)
    rows = Math.max(rows, r + 1)
    s.set([c, r])
  }
  return [Math.min(MAX, cols), Math.min(MAX, rows)]
}
