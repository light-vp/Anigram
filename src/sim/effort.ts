// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Domain, Scene, Signal } from './types.ts'
import { DROP_EXPONENT, EFFORT_UNITS } from './types.ts'

/*
 * Effort: the pressure, voltage or temperature behind a flow, read off a
 * tick's flows once they are solved.
 *
 * The flow solve decides how much goes where; effort says how hard it had to
 * be pushed. A part that sets an effort (a supply, a boiler, a regulator)
 * holds its outlet there; a pump adds its head; a transformer multiplies by
 * its ratio. Every link and part with a `drop` loses some on the way, more
 * the harder it works — as the square of the flow in a pipe, in proportion
 * in a cable. Where lines meet, the flows' efforts mix by how much each
 * brings; where nothing flows, the highest effort stands (a shut tap still
 * has the mains behind it).
 *
 * So a thin cable leaves the last house on the street on a low voltage, a
 * throttled valve shows its pressure drop, and a pump against a shut valve
 * builds the pressure that lifts a relief valve.
 */

/** what the effort pass needs from the compiled scene, worked out once */
export interface EffortModel {
  /** whether anything in the scene sets or loses effort; if not, the pass is skipped */
  active: boolean
  /** parts in the order effort flows through them, sources first */
  order: Int32Array
  /** the links that bring each part the effort it reads at its inlet */
  feeds: Int32Array[]
  /** per link: the effort it loses at its capacity, and the power of flow it grows with */
  linkDrop: Float64Array
  linkExp: Float64Array
  /** per part: whether its effort is a temperature, which a shut valve leaves unknown rather than zero */
  thermal: Uint8Array
  partExp: Float64Array
}

interface Graph {
  scene: Scene
  list: Scene['parts']
  from: Int32Array
  to: Int32Array
  dom: Int32Array
  cap: Float64Array
  inputs: Int32Array[]
  domains: readonly Domain[]
}

export function compileEffort(g: Graph): EffortModel {
  const { list, scene } = g
  const n = list.length
  const active =
    list.some(
      (p) =>
        p.effort !== undefined ||
        (p.behaviour.role === 'gate' && p.behaviour.relief !== undefined),
    ) || scene.links.some((l) => l.drop !== undefined)

  // the domain a part's effort is read in: what it makes, for a converter;
  // otherwise what arrives, or for a source what leaves
  const effortDomain = new Int32Array(n).fill(-1)
  const outgoing: number[][] = list.map(() => [])
  scene.links.forEach((l, i) => {
    if (!l.loss) outgoing[g.from[i]!]!.push(i)
  })
  for (let k = 0; k < n; k++) {
    const b = list[k]!.behaviour
    if (b.role === 'converter') effortDomain[k] = g.domains.indexOf(b.output)
    else if (g.inputs[k]!.length) effortDomain[k] = g.dom[g.inputs[k]![0]!]!
    else if (outgoing[k]!.length) effortDomain[k] = g.dom[outgoing[k]![0]!]!
  }
  const feeds = list.map((_, k) =>
    Int32Array.from(
      [...g.inputs[k]!].filter((i) => g.dom[i] === effortDomain[k]),
    ),
  )

  // depth-first from every part along its feeds gives an order where each
  // part comes after what feeds it, loops aside
  const order: number[] = []
  const state = new Uint8Array(n) // 0 new, 1 on the stack, 2 placed
  for (let root = 0; root < n; root++) {
    if (state[root]) continue
    const stack: Array<[number, number]> = [[root, 0]]
    state[root] = 1
    while (stack.length) {
      const top = stack[stack.length - 1]!
      const [k, at] = top
      const f = feeds[k]!
      if (at < f.length) {
        top[1]++
        const up = g.from[f[at]!]!
        if (!state[up]) {
          state[up] = 1
          stack.push([up, 0])
        }
        continue
      }
      stack.pop()
      state[k] = 2
      order.push(k)
    }
  }

  const exp = (d: number) => (d >= 0 ? (DROP_EXPONENT[g.domains[d]!] ?? 1) : 1)
  return {
    active,
    order: Int32Array.from(order),
    feeds,
    linkDrop: Float64Array.from(scene.links, (l) => l.drop ?? 0),
    linkExp: Float64Array.from(scene.links, (_, i) => exp(g.dom[i]!)),
    thermal: Uint8Array.from(effortDomain, (d) =>
      d >= 0 && g.domains[d] === 'heat' ? 1 : 0,
    ),
    partExp: Float64Array.from(effortDomain, exp),
  }
}

/** the flows and openings one tick settled on, which effort is read from */
export interface Settled {
  flow: Float64Array
  /** per part: what it delivered (a converter's product, a source's output) */
  out: Float64Array
  /** per part: what a source could have given */
  avail: Float64Array
  open: Float64Array
  /** a converter with a startup time that hasn't delivered yet */
  cold: Uint8Array
  /** a store that has run dry */
  empty: Uint8Array
}

const EPS = 1e-9

/** how much of `drop` is lost at `flow` out of `cap`, growing as flow to the `exp` */
function lost(drop: number, flow: number, cap: number, exp: number): number {
  if (!drop || !(cap > 0) || !Number.isFinite(cap)) return 0
  return drop * Math.pow(Math.abs(flow) / cap, exp)
}

/**
 * Effort at every part's inlet and outlet, and at each end of every link.
 * NaN where nothing sets one: a part with no supply behind it that sets an
 * effort has none to show.
 */
export function solveEffort(
  g: Graph,
  m: EffortModel,
  s: Settled,
  read: (signal: Signal) => number,
) {
  const n = g.list.length
  const L = g.scene.links.length
  const eIn = new Float64Array(n).fill(NaN)
  const eOut = new Float64Array(n).fill(NaN)
  const linkFrom = new Float64Array(L).fill(NaN)
  const linkTo = new Float64Array(L).fill(NaN)
  if (!m.active) return { eIn, eOut, linkFrom, linkTo }

  // signals are read once; they can't depend on this tick's effort
  const set = new Float64Array(n).fill(NaN)
  const boost = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const e = g.list[k]!.effort
    if (!e) continue
    if (e.set !== undefined) set[k] = read(e.set)
    if (e.boost !== undefined) boost[k] = read(e.boost)
  }

  const pass = (): number => {
    let moved = 0
    for (const k of m.order) {
      const p = g.list[k]!
      const b = p.behaviour
      // what arrives: the flows' efforts, mixed by how much each brings
      let sum = 0
      let weight = 0
      let top = NaN
      for (const i of m.feeds[k]!) {
        const at = eOut[g.from[i]!]!
        if (Number.isNaN(at)) continue
        let end =
          at - lost(m.linkDrop[i]!, s.flow[i]!, g.cap[i]!, m.linkExp[i]!)
        if (!m.thermal[k]) end = Math.max(0, end)
        linkFrom[i] = at
        linkTo[i] = end
        if (s.flow[i]! > EPS) {
          sum += end * s.flow[i]!
          weight += s.flow[i]!
        }
        if (!(end <= top)) top = end
      }
      const inlet = weight > EPS ? sum / weight : top
      const e = p.effort
      let out = inlet
      switch (b.role) {
        case 'source':
          // a supply holds its effort while it has something to give
          out = Number.isNaN(set[k]!)
            ? NaN
            : s.avail[k]! > EPS
              ? set[k]!
              : m.thermal[k]
                ? NaN
                : 0
          break
        case 'storage':
          // like a supply, a store holds its effort only while it has something to give
          if (!Number.isNaN(set[k]!))
            out = s.empty[k] ? (m.thermal[k] ? NaN : 0) : set[k]!
          break
        case 'converter': {
          if (s.cold[k]) {
            out = m.thermal[k] ? NaN : 0
            break
          }
          if (!Number.isNaN(set[k]!)) out = set[k]!
          else if (e?.ratio !== undefined) out = inlet * e.ratio
          if (e?.boost !== undefined)
            out = (Number.isNaN(out) ? 0 : out) + boost[k]!
          out -= lost(
            e?.drop ?? 0,
            s.out[k]!,
            b.capacity ?? Infinity,
            m.partExp[k]!,
          )
          break
        }
        case 'gate':
          if (s.open[k]! <= 1e-3) {
            out = m.thermal[k] ? NaN : 0
            break
          }
          out -= lost(
            e?.drop ?? 0,
            s.out[k]!,
            b.capacity * s.open[k]!,
            m.partExp[k]!,
          )
          if (!Number.isNaN(set[k]!) && !(out <= set[k]!)) out = set[k]!
          break
        case 'bus':
        case 'sink':
        case 'vent':
          break
      }
      if (!m.thermal[k] && out < 0) out = 0
      const before = eOut[k]!
      if (!(before === out || (Number.isNaN(before) && Number.isNaN(out))))
        moved = Math.max(
          moved,
          Number.isNaN(before) || Number.isNaN(out)
            ? Infinity
            : Math.abs(before - out),
        )
      eIn[k] = inlet
      eOut[k] = out
    }
    return moved
  }
  // one pass settles a sheet without loops; a loop takes a few more
  for (let i = 0; i < 8 && pass() > 1e-9; i++);
  return { eIn, eOut, linkFrom, linkTo }
}

/** the unit a part's effort is in: its domain's, as the scene names it */
export function effortUnit(
  scene: Pick<Scene, 'parts' | 'links' | 'units'>,
  partId: string,
): string {
  const p = scene.parts.find((x) => x.id === partId)
  const b = p?.behaviour
  const link =
    b?.role === 'converter'
      ? undefined
      : (scene.links.find((l) => l.to === partId && !l.loss) ??
        scene.links.find((l) => l.from === partId && !l.loss))
  const domain = b?.role === 'converter' ? b.output : link?.domain
  if (!domain) return ''
  return scene.units[domain]?.effort ?? EFFORT_UNITS[domain] ?? ''
}

/** an effort to read at a glance: `4.2 bar`, `231 V`, `68 °C` */
export function formatEffort(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '–'
  const a = Math.abs(value)
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2
  const n = Number(value.toFixed(digits)).toString()
  return unit ? `${n} ${unit}` : n
}
