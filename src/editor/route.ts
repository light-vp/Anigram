// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LinkSpec } from '../sim/types.ts'

/*
 * Where a new link runs. Straight if it can, otherwise whichever elbow, or a
 * dogleg half a cell to one side, runs through the fewest parts and along the
 * fewest lines already drawn. Only links the editor is placing are routed:
 * a link someone (or an assistant) already routed keeps its corners.
 */

type Pt = [number, number]

export interface RouteSheet {
  size: [number, number]
  parts: Array<{ id: string; at: [number, number] }>
  links: LinkSpec[]
  drawing?: string
  /** a P&ID's bubbles, and the signal lines they hang on, are in the way too */
  instruments?: Array<{
    tag: string
    at: [number, number]
    measures: string
    drives?: string
  }>
}

/** the instruments the sheet draws: only a P&ID has them */
const bubbles = (sheet: RouteSheet) =>
  sheet.drawing === 'pid' ? (sheet.instruments ?? []) : []

/** the lines an instrument hangs on, in grid cells, as the sheet draws them */
function signalCells(sheet: RouteSheet): Pt[][] {
  const out: Pt[][] = []
  const wire = (a: Pt, b: Pt): Pt[] =>
    a[0] === b[0] || a[1] === b[1] ? [a, b] : [a, [a[0], b[1]], b]
  for (const i of bubbles(sheet)) {
    const target = (id: string | undefined) =>
      sheet.instruments?.find((o) => o.tag === id)?.at ??
      sheet.parts.find((p) => p.id === id)?.at
    for (const id of [i.measures, i.drives]) {
      const t = target(id)
      if (t) out.push(wire(i.at, t))
    }
  }
  return out
}

export type Route = Pick<LinkSpec, 'via' | 'bend'>

/** a link's corners in grid cells, as the sheet draws it */
export function cellsOf(sheet: RouteSheet, link: LinkSpec): Pt[] | undefined {
  const a = sheet.parts.find((p) => p.id === link.from)?.at
  const b = sheet.parts.find((p) => p.id === link.to)?.at
  if (!a || !b) return undefined
  if (link.via) return [a, ...link.via, b]
  if (a[0] === b[0] || a[1] === b[1]) return [a, b]
  return link.bend === 'vh' ? [a, [a[0], b[1]], b] : [a, [b[0], a[1]], b]
}

/**
 * A route for one link, given the lines already on the sheet. A link with a
 * twin running the other way follows the twin back exactly.
 */
export function routeLink(
  sheet: RouteSheet,
  link: Pick<LinkSpec, 'from' | 'to'> & { bend?: 'hv' | 'vh' },
  drawn: Pt[][],
  twin?: Pt[],
): { route: Route; cells: Pt[] } {
  const a = sheet.parts.find((p) => p.id === link.from)!.at
  const b = sheet.parts.find((p) => p.id === link.to)!.at
  if (twin && !link.bend) {
    const back = [...twin].reverse()
    const via = back.slice(1, -1)
    const route: Route =
      via.length === 0
        ? {}
        : via.length === 1 && !isHalf(via[0]!)
          ? { bend: via[0]![0] === a[0] ? 'vh' : 'hv' }
          : { via }
    return { route, cells: back }
  }
  const candidates: Array<{ pts: Pt[]; out: Route }> = []
  const add = (via: Pt[] | null, bend?: 'hv' | 'vh') => {
    const corner: Pt[] =
      via ?? (bend === 'vh' ? [[a[0], b[1]]] : [[b[0], a[1]]])
    candidates.push({
      pts: [a, ...corner, b],
      out: via ? { via } : { bend: bend ?? 'hv' },
    })
  }
  if (link.bend) add(null, link.bend)
  else if (a[0] === b[0] || a[1] === b[1]) {
    candidates.push({ pts: [a, b], out: {} })
    for (const o of [0.5, -0.5]) {
      if (a[1] === b[1])
        add([
          [a[0], a[1] + o],
          [b[0], b[1] + o],
        ])
      else
        add([
          [a[0] + o, a[1]],
          [b[0] + o, b[1]],
        ])
    }
  } else {
    add(null, 'hv')
    add(null, 'vh')
    for (const o of [0.5, -0.5]) {
      add([
        [a[0], a[1] + o],
        [b[0], a[1] + o],
      ])
      add([
        [a[0] + o, a[1]],
        [a[0] + o, b[1]],
      ])
    }
  }
  let best = candidates[0]!
  let bestCost = Infinity
  const lines = [...drawn, ...signalCells(sheet)]
  for (const c of candidates) {
    const cost = costOf(c.pts, sheet, link, lines) + c.pts.length * 0.5
    if (cost < bestCost - 1e-9) {
      best = c
      bestCost = cost
    }
  }
  return { route: best.out, cells: best.pts }
}

/**
 * Route every link in order, each avoiding the ones before it: how the old
 * playground laid out a whole sheet, kept for its saved sheets.
 */
export function routeAll(sheet: RouteSheet): Route[] {
  const drawn: Pt[][] = []
  return sheet.links.map((link) => {
    const twin = sheet.links.findIndex(
      (l) => l.from === link.to && l.to === link.from,
    )
    const { route, cells } = routeLink(
      sheet,
      link,
      drawn,
      twin >= 0 && twin < drawn.length ? drawn[twin] : undefined,
    )
    drawn.push(cells)
    return route
  })
}

const isHalf = ([c, r]: Pt) => c % 1 !== 0 || r % 1 !== 0

function costOf(
  pts: Pt[],
  sheet: RouteSheet,
  link: Pick<LinkSpec, 'from' | 'to'>,
  drawn: Pt[][],
): number {
  let cost = 0
  const step = 0.25
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.max(1, Math.round(len / step))
    for (let k = 0; k <= n; k++) {
      const x = x1 + ((x2 - x1) * k) / n
      const y = y1 + ((y2 - y1) * k) / n
      for (const p of sheet.parts) {
        if (p.id === link.from || p.id === link.to) continue
        if (Math.abs(p.at[0] - x) < 0.35 && Math.abs(p.at[1] - y) < 0.35)
          cost += 4
      }
      for (const i of bubbles(sheet))
        if (Math.abs(i.at[0] - x) < 0.35 && Math.abs(i.at[1] - y) < 0.35)
          cost += 4
      // off the sheet
      if (
        x < -0.45 ||
        y < -0.45 ||
        x > sheet.size[0] - 0.55 ||
        y > sheet.size[1] - 0.55
      )
        cost += 6
      for (const other of drawn) if (onPath(other, x, y)) cost += 0.6
    }
  }
  return cost
}

function onPath(pts: Pt[], x: number, y: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    if (
      x1 === x2 &&
      Math.abs(x - x1) < 0.05 &&
      y > Math.min(y1, y2) + 0.3 &&
      y < Math.max(y1, y2) - 0.3
    )
      return true
    if (
      y1 === y2 &&
      Math.abs(y - y1) < 0.05 &&
      x > Math.min(x1, x2) + 0.3 &&
      x < Math.max(x1, x2) - 0.3
    )
      return true
  }
  return false
}
