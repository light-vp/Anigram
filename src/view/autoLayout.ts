// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf, shownParts, shows } from '../packs/catalogue.ts'
import type { LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import { CELL, TILE, isEngineering } from './geometry.ts'

/** a nominal reading, for sizing labels before anything has run */
const VALUE = '000.0 kW'

/*
 * Places every part on the grid by how things flow, the way a drafter lays
 * out a sheet: sources first, each step one column (or row) further on,
 * lines straight where they can be and turning square where they can't.
 * A layered drawing: break the loops, give each part a layer by the longest
 * path to it, thread long links through empty cells, order each layer to
 * keep lines from crossing, then line each part up with what feeds it.
 *
 * Single-lines run top to bottom, as they are drawn: supply at the top,
 * loads at the bottom, feeders dropping off the busbars. Fluid-power
 * circuits run bottom to top, as ISO 1219-2 lays them out: the pump and
 * tank at the bottom, the actuators at the top. Everything else runs left
 * to right. React-free; the MCP server's auto_layout calls it.
 */

export type Direction = 'right' | 'down' | 'up'

/** which way a sheet's flow runs when nobody says */
const DIRECTION: Partial<Record<string, Direction>> = {
  'single-line': 'down',
  'fluid-power': 'up',
}

export interface LayoutResult {
  scene: Scene
  direction: Direction
  /** the parts whose cell changed */
  moved: string[]
}

type Cell = [number, number]

const key = ([c, r]: Cell) => `${c},${r}`

export function autoLayout(scene: Scene, direction?: Direction): LayoutResult {
  const dir: Direction = direction ?? DIRECTION[scene.drawing ?? ''] ?? 'right'
  const eng = isEngineering(scene)
  const shown = shownParts(scene)
  const laid = scene.parts.filter((p) => !eng || shown.has(p.id))
  const ids = laid.map((p) => p.id)
  const isLaid = new Set(ids)
  const byId = new Map(scene.parts.map((p) => [p.id, p]))
  const busbar = (id: string) => {
    const p = byId.get(id)
    return eng && !!p && classOf(p, scene) === 'Busbar'
  }
  // where a part already sits across the flow, to keep the author's order
  const across = (p: PartSpec) => (dir === 'right' ? p.at[1] : p.at[0])
  const along = (p: PartSpec) => (dir === 'right' ? p.at[0] : p.at[1])

  // the flow graph: one edge per pair of parts, a twin pair kept as one
  const edges: Array<[string, string]> = []
  const seen = new Set<string>()
  for (const l of scene.links) {
    if (eng && !shows(l, scene)) continue
    if (!isLaid.has(l.from) || !isLaid.has(l.to) || l.from === l.to) continue
    if (seen.has(`${l.from}>${l.to}`) || seen.has(`${l.to}>${l.from}`)) continue
    seen.add(`${l.from}>${l.to}`)
    edges.push([l.from, l.to])
  }

  // break the loops: depth first from the sources, turning back-edges round
  const out = new Map(ids.map((id) => [id, [] as string[]]))
  for (const [a, b] of edges) out.get(a)!.push(b)
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const [, b] of edges) indeg.set(b, indeg.get(b)! + 1)
  const order = [...laid]
    .sort(
      (a, b) =>
        (indeg.get(a.id)! === 0 ? 0 : 1) - (indeg.get(b.id)! === 0 ? 0 : 1) ||
        along(a) - along(b) ||
        across(a) - across(b),
    )
    .map((p) => p.id)
  const state = new Map<string, 1 | 2>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const n of out.get(id)!) {
      if (state.get(n) === 1) back.add(`${id}>${n}`)
      else if (!state.has(n)) visit(n)
    }
    state.set(id, 2)
  }
  for (const id of order) if (!state.has(id)) visit(id)
  const dag = edges.map(([a, b]) =>
    back.has(`${a}>${b}`)
      ? ([b, a] as [string, string])
      : ([a, b] as [string, string]),
  )
  const preds = new Map(ids.map((id) => [id, [] as string[]]))
  const succs = new Map(ids.map((id) => [id, [] as string[]]))
  for (const [a, b] of dag) {
    succs.get(a)!.push(b)
    preds.get(b)!.push(a)
  }

  // layers: the longest path in, then each source pulled up to what it feeds
  const layer = new Map<string, number>()
  const depth = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!
    layer.set(id, 0)
    const d = Math.max(0, ...preds.get(id)!.map((p) => depth(p) + 1))
    layer.set(id, d)
    return d
  }
  for (const id of order) depth(id)
  for (const id of order)
    if (!preds.get(id)!.length && succs.get(id)!.length)
      layer.set(id, Math.min(...succs.get(id)!.map((s) => layer.get(s)!)) - 1)
  const lo = Math.min(...ids.map((id) => layer.get(id)!))
  for (const id of ids) layer.set(id, layer.get(id)! - lo)

  // long links thread through placeholder nodes, one per layer they cross
  type Node = { id: string; dummy: boolean }
  const nodes = new Map<string, Node>(
    ids.map((id) => [id, { id, dummy: false }]),
  )
  const chains = new Map<string, string[]>()
  const up = new Map(ids.map((id) => [id, [] as string[]]))
  for (const [a, b] of dag) {
    const chain = [a]
    for (let k = layer.get(a)! + 1; k < layer.get(b)!; k++) {
      const d = `~${a}>${b}~${k}`
      nodes.set(d, { id: d, dummy: true })
      layer.set(d, k)
      up.set(d, [])
      chain.push(d)
    }
    chain.push(b)
    for (let i = 1; i < chain.length; i++)
      up.get(chain[i]!)!.push(chain[i - 1]!)
    chains.set(`${a}>${b}`, chain)
  }
  const down = new Map([...nodes.keys()].map((id) => [id, [] as string[]]))
  for (const [id, ps] of up) for (const p of ps) down.get(p)!.push(id)

  // order each layer: the author's order first, then barycentre sweeps
  const layers: string[][] = []
  for (const [id] of nodes) (layers[layer.get(id)!] ??= []).push(id)
  const start = (id: string) => {
    const p = byId.get(id)
    if (p) return across(p)
    const [a, b] = id.slice(1, id.lastIndexOf('~')).split('>')
    return (across(byId.get(a!)!) + across(byId.get(b!)!)) / 2
  }
  for (const l of layers) l.sort((a, b) => start(a) - start(b))
  const pos = new Map<string, number>()
  const index = () =>
    layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)))
  index()
  for (let sweep = 0; sweep < 6; sweep++) {
    const forward = sweep % 2 === 0
    const range = forward
      ? layers.map((_, i) => i).slice(1)
      : layers
          .map((_, i) => i)
          .slice(0, -1)
          .reverse()
    for (const i of range) {
      const nb = forward ? up : down
      const bary = (id: string) => {
        const n = nb.get(id)!
        return n.length
          ? n.reduce((s, x) => s + pos.get(x)!, 0) / n.length
          : pos.get(id)!
      }
      layers[i]!.sort((a, b) => bary(a) - bary(b) || pos.get(a)! - pos.get(b)!)
      index()
    }
  }

  // across the flow: each node lines up with what feeds it, keeping order
  const place = new Map<string, number>()
  for (const l of layers) {
    let next = 0
    for (const id of l) {
      const ps = up.get(id)!.map((p) => place.get(p)!)
      // a busbar's feeders fan out from it rather than stack on its line
      const fan = ps.length === 1 && up.get(id)!.some(busbar)
      const want = ps.length
        ? fan
          ? next
          : ps.sort((a, b) => a - b)[Math.floor((ps.length - 1) / 2)]!
        : next
      const at = Math.max(next, want)
      place.set(id, at)
      next = at + 1
    }
  }
  // and back the other way, so a part fed from below doesn't sit above it all
  for (let i = layers.length - 2; i >= 0; i--) {
    const l = layers[i]!
    for (let k = l.length - 1; k >= 0; k--) {
      const id = l[k]!
      if (up.get(id)!.length) continue
      const ds = down.get(id)!.map((d) => place.get(d)!)
      if (!ds.length) continue
      const hi = k + 1 < l.length ? place.get(l[k + 1]!)! - 1 : Infinity
      const lo2 = k > 0 ? place.get(l[k - 1]!)! + 1 : 0
      const want = Math.min(...ds)
      place.set(id, Math.max(lo2, Math.min(hi, want)))
    }
  }

  // nothing else shares a busbar's line inside its reach: a part beside the
  // bar moves out past the feeders the bar has to stretch to
  if (dir !== 'right')
    for (const l of layers) {
      const bars = l.filter(busbar)
      for (const b of bars) {
        const reach = Math.max(
          place.get(b)!,
          ...[...up.get(b)!, ...down.get(b)!].map((n) => place.get(n)!),
        )
        let from = place.get(b)!
        for (const id of l) {
          if (place.get(id)! <= from) continue
          const at = Math.max(place.get(id)!, reach + 1, from + 1)
          place.set(id, at)
          from = at
        }
      }
    }

  // instruments sit a row above what they serve, so the grid opens one up
  const instruments = scene.drawing === 'pid' ? (scene.instruments ?? []) : []
  const shift = instruments.length && dir === 'right' ? 1 : 0
  // a sheet running downwards sets its words beside each part, so its
  // columns open up to fit the widest
  const words = laid.map(
    (p) => Math.max(p.label.length, (p.tag ?? '').length, VALUE.length) * 6.4,
  )
  const gap =
    dir !== 'right'
      ? Math.max(
          1,
          Math.ceil(((TILE / 2 + 10 + Math.max(...words) + 16) / CELL) * 2) / 2,
        )
      : 1
  // running up the sheet, the last layer is the top row
  const top = layers.length - 1
  const cellOf = (id: string): Cell => {
    const a = dir === 'up' ? top - layer.get(id)! : layer.get(id)!
    const b = place.get(id)! * gap + shift
    return dir === 'right' ? [a, b] : [b, a]
  }

  const taken = new Set<string>()
  for (const id of nodes.keys()) taken.add(key(cellOf(id)))
  const free = (near: Cell, rings = 6): Cell => {
    for (let r = 1; r <= rings; r++)
      for (let dc = -r; dc <= r; dc++)
        for (const dr of [
          -r,
          r,
          ...Array.from({ length: 2 * r - 1 }, (_, i) => i - r + 1),
        ]) {
          const c: Cell = [near[0] + dc, near[1] + dr]
          if (c[0] < 0 || c[1] < 0 || taken.has(key(c))) continue
          return c
        }
    return [near[0] + rings + 1, near[1]]
  }

  const next = structuredClone(scene)
  const moved: string[] = []
  const put = (p: PartSpec, c: Cell) => {
    if (p.at[0] !== c[0] || p.at[1] !== c[1]) moved.push(p.id)
    p.at = c
  }
  for (const p of next.parts) if (isLaid.has(p.id)) put(p, cellOf(p.id))
  // parts the sheet doesn't draw still need a cell: beside what they feed
  for (const p of next.parts) {
    if (isLaid.has(p.id)) continue
    const l = scene.links.find((x) => x.from === p.id || x.to === p.id)
    const other = l && byId.get(l.from === p.id ? l.to : l.from)
    const near = other && isLaid.has(other.id) ? cellOf(other.id) : [0, 0]
    const c = free(near as Cell)
    taken.add(key(c))
    put(p, c)
  }
  next.instruments = next.instruments?.map((inst) => {
    const target = inst.drives ?? inst.measures
    const anchor = next.parts.find((p) => p.id === target)
    const via = next.instruments!.find((o) => o.tag === inst.measures)
    const base: Cell = anchor
      ? [anchor.at[0], anchor.at[1]]
      : via
        ? [via.at[0], via.at[1]]
        : [0, 0]
    // above its part, or beside that spot, before anywhere else
    const tries: Cell[] = [0, 1, -1, 2, -2].map((d) => [
      base[0] + d,
      base[1] - 1,
    ])
    const c =
      tries.find((t) => t[0] >= 0 && t[1] >= 0 && !taken.has(key(t))) ??
      free(base)
    taken.add(key(c))
    return { ...inst, at: c }
  })

  // lines: square turns halfway between layers, straight on through placeholders
  const half = (a: Cell, b: Cell): Cell[] => {
    if (dir === 'right') {
      const x = Math.min(a[0], b[0]) + 0.5
      return a[1] === b[1]
        ? []
        : [
            [x, a[1]],
            [x, b[1]],
          ]
    }
    const y = Math.min(a[1], b[1]) + 0.5
    return a[0] === b[0]
      ? []
      : [
          [a[0], y],
          [b[0], y],
        ]
  }
  next.links = next.links.map((l): LinkSpec => {
    const { via: _via, bend: _bend, ...rest } = l
    const chain =
      chains.get(`${l.from}>${l.to}`) ??
      chains.get(`${l.to}>${l.from}`)?.slice().reverse()
    if (!chain) return rest
    // a busbar is tapped where the feeder is, which the sheet does by itself
    if (chain.length === 2 && (busbar(l.from) || busbar(l.to))) return rest
    const cells = chain.map(cellOf)
    const pts: Cell[] = []
    const last = cells.length - 2
    for (let i = 0; i <= last; i++) {
      if (i > 0) pts.push(cells[i]!)
      // the hop onto a busbar stays straight: the sheet taps the bar there
      const bar =
        (i === 0 && busbar(chain[0]!)) || (i === last && busbar(chain.at(-1)!))
      if (!bar) pts.push(...half(cells[i]!, cells[i + 1]!))
    }
    // drop corners that sit on a straight run
    const all = [cells[0]!, ...pts, cells.at(-1)!]
    const via = pts.filter((p, i) => {
      const a = all[i]!
      const b = all[i + 2]!
      return !(
        (a[0] === p[0] && p[0] === b[0]) ||
        (a[1] === p[1] && p[1] === b[1])
      )
    })
    return via.length ? { ...rest, via } : rest
  })

  // words go beside a part on a sheet that runs downwards, below otherwise
  for (const p of next.parts) {
    if (dir !== 'right' && !busbar(p.id)) p.labelSide = 'right'
    else delete p.labelSide
  }

  const cells = [
    ...next.parts.map((p) => p.at),
    ...(next.instruments ?? []).map((i) => i.at),
    ...next.links.flatMap((l) => l.via ?? []),
  ]
  next.size = [
    Math.ceil(Math.max(...cells.map((c) => c[0])) + 1),
    Math.ceil(Math.max(...cells.map((c) => c[1])) + 1),
  ]
  return { scene: next, direction: dir, moved }
}

type Raw = Record<string, unknown>

/**
 * A laid-out scene's geometry written into the file it came from: `size`,
 * each part's `at` and `labelSide`, each link's corners and each instrument's
 * cell, and nothing else, so the file keeps its own order and fields.
 */
export function withLayout<T extends object>(raw: T, laid: Scene): T {
  const out = structuredClone(raw) as Raw & {
    parts: Raw[]
    links: Raw[]
    instruments?: Raw[]
  }
  out.size = laid.size
  out.parts.forEach((p, i) => {
    const q = laid.parts[i]!
    p.at = q.at
    if (q.labelSide) p.labelSide = q.labelSide
    else delete p.labelSide
  })
  out.links.forEach((l, i) => {
    const q = laid.links[i]!
    delete l.bend
    if (q.via) l.via = q.via
    else delete l.via
  })
  out.instruments?.forEach((x, i) => {
    x.at = laid.instruments![i]!.at
  })
  return out as T
}
