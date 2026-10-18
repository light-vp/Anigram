// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PACKS, classOf, shows } from '../packs/catalogue.ts'
import type { Ports } from '../packs/catalogue.ts'
import { TILE, cellToPx, linkPoints } from './geometry.ts'
import type { Pt } from './geometry.ts'
import { LABEL_OFFSET } from './layout.ts'
import type { LineType, LinkSpec, PartSpec, Scene } from '../sim/types.ts'

/** what a link is drawn as: given, or a signal for data and a process line otherwise */
export function lineOf(link: LinkSpec): LineType {
  return link.line ?? (link.domain === 'data' ? 'signal' : 'process')
}

export const LINE_NAMES: Record<LineType, string> = {
  process: 'process line',
  utility: 'utility line',
  signal: 'signal line',
  pneumatic: 'pneumatic signal',
  data: 'data link',
  hydraulic: 'hydraulic signal',
  capillary: 'capillary tube',
  electromagnetic: 'electromagnetic signal',
}

export interface Way {
  /** the lines at the part run up and down, so an inline symbol turns to match */
  vertical: boolean
  /** which way the flow travels at the part, in degrees: into a sink, out of a source */
  angle: number
}

/** how the lines meet a part */
export function partWay(
  part: PartSpec,
  links: LinkSpec[],
  geometry: Pt[][],
): Way {
  let v = 0
  let h = 0
  let angle: number | undefined
  links.forEach((l, i) => {
    const pts = geometry[i]!
    let a: Pt | undefined
    let b: Pt | undefined
    if (l.from === part.id) [a, b] = [pts[0], pts[1]]
    else if (l.to === part.id)
      [a, b] = [pts[pts.length - 2], pts[pts.length - 1]]
    if (!a || !b) return
    if (Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0])) v++
    else h++
    angle ??= (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  })
  return { vertical: v > h, angle: angle ?? 0 }
}

/** how far a busbar reaches either side of its centre when nothing widens it */
export const BUSBAR_HALF = 50

/**
 * a link's points with each busbar end moved to where it taps the bar: a
 * feeder on another row drops straight from the bar above or below it,
 * rather than every feeder leaving from the bar's centre
 */
export function tapBusbars(scene: Scene, link: LinkSpec, pts: Pt[]): Pt[] {
  const bar = (id: string) => {
    const p = scene.parts.find((q) => q.id === id)
    return p && classOf(p, scene) === 'Busbar' ? p : undefined
  }
  const fromBar = bar(link.from)
  if (!fromBar && !bar(link.to)) return pts
  // work from the bar outwards, then put the link back the way it runs
  const out = fromBar ? pts : [...pts].reverse()
  const cy = out[0]![1]
  const far = out[out.length - 1]!
  // a link to a part on the bar's own row joins it at its end
  if (!link.via && Math.abs(far[1] - cy) < 0.5) return pts
  const x = link.via ? out[1]![0] : far[0]
  const tapped = [[x, cy] as Pt, ...(link.via ? out.slice(1) : [far])].filter(
    (p, i, a) => i === 0 || p[0] !== a[i - 1]![0] || p[1] !== a[i - 1]![1],
  )
  return fromBar ? tapped : tapped.reverse()
}

/** each busbar's reach either side of its centre, wide enough for every tap */
export function busbarSpans(
  scene: Scene,
  links: LinkSpec[],
  geometry: Pt[][],
): Map<string, [number, number]> {
  const spans = new Map<string, [number, number]>()
  for (const p of scene.parts) {
    if (classOf(p, scene) !== 'Busbar') continue
    const [cx] = cellToPx(p.at)
    let lo = -BUSBAR_HALF
    let hi = BUSBAR_HALF
    links.forEach((l, i) => {
      const pts = geometry[i]!
      const end =
        l.from === p.id ? pts[0] : l.to === p.id ? pts.at(-1) : undefined
      if (!end) return
      lo = Math.min(lo, end[0] - cx - 14)
      hi = Math.max(hi, end[0] - cx + 14)
    })
    spans.set(p.id, [lo, hi])
  }
  return spans
}

// ---- fluid power: lines onto ports -------------------------------------------

/** a part's ports, on a sheet that draws them */
function portsOf(scene: Scene, id: string): Ports | undefined {
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  const p = scene.parts.find((q) => q.id === id)
  const c = p && classOf(p, scene)
  return c ? pack?.classes[c]?.ports : undefined
}

type Side = 'top' | 'bottom'

/** the side of a part a line arrives on, from the point before its end; none from the side */
function sideOf(end: Pt, before: Pt): Side | undefined {
  const dx = before[0] - end[0]
  const dy = before[1] - end[1]
  if (Math.abs(dy) <= Math.abs(dx)) return undefined
  return dy > 0 ? 'bottom' : 'top'
}

/**
 * The port the line to `other` takes on one side of a part, as an offset
 * from its centre. Every line arriving on that side shares the ports out: the
 * one coming in takes the supply port (a valve's P), the rest go in order
 * across, left to right as they arrive. A two-way pair is one line.
 */
function portOffset(
  scene: Scene,
  id: string,
  side: Side,
  ports: Ports,
  other: string,
): number | undefined {
  const xs = ports[side]
  if (!xs?.length) return undefined
  const arrivals = new Map<string, { x: number; into: boolean; out: boolean }>()
  for (const l of scene.links) {
    if (l.from !== id && l.to !== id) continue
    if (!shows(l, scene)) continue
    const pts = tapBusbars(scene, l, linkPoints(scene, l, false))
    const into = l.to === id
    const end = into ? pts.at(-1)! : pts[0]!
    const before = into ? pts.at(-2)! : pts[1]!
    if (sideOf(end, before) !== side) continue
    const key = into ? l.from : l.to
    const a = arrivals.get(key) ?? { x: before[0], into: false, out: false }
    if (into) a.into = true
    else a.out = true
    arrivals.set(key, a)
  }
  const order = [...arrivals.entries()].sort((a, b) => a[1].x - b[1].x)
  const free = xs.map((_, i) => i)
  const port = new Map<string, number>()
  if (side === 'bottom' && ports.supply !== undefined) {
    const inlet = order.find(([, a]) => a.into && !a.out)
    if (inlet) {
      port.set(inlet[0], ports.supply)
      free.splice(free.indexOf(ports.supply), 1)
    }
  }
  for (const [key] of order)
    if (!port.has(key) && free.length) port.set(key, free.shift()!)
  const i = port.get(other)
  return i === undefined ? undefined : xs[i]
}

/**
 * A link's points with each end that arrives at a ported part (a valve, a
 * cylinder) from above or below moved onto its port, so P and T run into a
 * directional valve side by side as ISO 1219 draws them. A corner before the
 * port moves with it; a straight line steps across close to the port that
 * needs it most.
 */
export function tapPorts(scene: Scene, link: LinkSpec, pts: Pt[]): Pt[] {
  if (scene.drawing !== 'fluid-power' || pts.length < 2) return pts
  const n = pts.length
  const at = (end: 0 | 1) => {
    const id = end ? link.to : link.from
    const ports = portsOf(scene, id)
    if (!ports) return undefined
    const p = pts[end ? n - 1 : 0]!
    const side = sideOf(p, pts[end ? n - 2 : 1]!)
    if (!side) return undefined
    const dx = portOffset(scene, id, side, ports, end ? link.from : link.to)
    if (dx === undefined) return undefined
    const y = p[1] + (side === 'bottom' ? ports.edge : -ports.edge)
    return { dx, pt: [p[0] + dx, y] as Pt }
  }
  const a = at(0)
  const b = at(1)
  if (!a && !b) return pts
  if (n === 2) {
    const from: Pt = a?.pt ?? pts[0]!
    const to: Pt = b?.pt ?? pts[1]!
    if (Math.abs(from[0] - to[0]) < 0.01) return [from, to]
    // step across near whichever end is furthest off the straight line
    const near = Math.abs(b?.dx ?? 0) >= Math.abs(a?.dx ?? 0) ? to : from
    const far = near === to ? from : to
    const y = near[1] + Math.sign(far[1] - near[1]) * 8
    return [from, [from[0], y], [to[0], y], to]
  }
  const out = pts.map((p) => [...p] as Pt)
  for (const [end, tap] of [
    [0, a],
    [n - 1, b],
  ] as const) {
    if (!tap) continue
    const next = end === 0 ? 1 : n - 2
    // the corner before the port, when the last run is straight up or down
    if (Math.abs(out[next]![0] - out[end]![0]) < 0.5) out[next]![0] += tap.dx
    out[end] = tap.pt
  }
  return out
}

/** a link's points as an engineering sheet draws them: onto busbar taps and ports */
export function engPoints(scene: Scene, link: LinkSpec): Pt[] {
  return tapPorts(
    scene,
    link,
    tapBusbars(scene, link, linkPoints(scene, link, false)),
  )
}

/** where a part's words sit on an engineering sheet: beside a wide symbol, clear of all of it */
export function engLabelOffset(scene: Scene, part: PartSpec) {
  const o = LABEL_OFFSET[part.labelSide ?? 'below']
  const c = classOf(part, scene)
  const info = c && scene.drawing ? PACKS[scene.drawing]?.classes[c] : undefined
  if (part.labelSide !== 'left' && part.labelSide !== 'right') {
    // clear of a tall symbol, and above it clear of a valve's actuator too
    const past = Math.max(0, (info?.tall ?? TILE / 2) - TILE / 2)
    if (part.labelSide === 'above')
      return { ...o, dy: o.dy - Math.max(past, hasActuator(part, c) ? 14 : 0) }
    return past ? { ...o, dy: o.dy + past } : o
  }
  return info?.reach ? { ...o, dx: Math.sign(o.dx) * (info.reach + 10) } : o
}

/** a valve drawn with an actuator on its stem */
const hasActuator = (part: PartSpec, cls: string | undefined) =>
  cls === 'ControlValve' || (!!part.actuator && !!cls?.endsWith('Valve'))
