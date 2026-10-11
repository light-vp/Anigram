// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LinkSpec, Scene } from '../sim/types.ts'

/** one grid cell, in sheet units */
export const CELL = 120
/** margin either side of the grid */
export const PAD = 40
/** the title and the clock, above the grid */
export const HEAD_H = 84
/** the legend, below the grid */
export const FOOT_H = 44
/** a part's tile, and its corner radius */
export const TILE = 52
export const TILE_R = 14

export type Pt = [number, number]

export function sheetSize(scene: Scene): { w: number; h: number } {
  return {
    w: scene.size[0] * CELL + PAD * 2,
    h: HEAD_H + scene.size[1] * CELL + FOOT_H,
  }
}

/** a grid cell (fractional cells allowed) to its centre on the sheet */
export function cellToPx([c, r]: Pt): Pt {
  return [PAD + c * CELL + CELL / 2, HEAD_H + r * CELL + CELL / 2]
}

/**
 * the corner points of a link, in sheet units. Two links running both ways
 * between the same parts sit side by side, unless `apart` is false (an
 * engineering drawing draws them as one line).
 */
export function linkPoints(scene: Scene, link: LinkSpec, apart = true): Pt[] {
  const from = scene.parts.find((p) => p.id === link.from)!.at
  const to = scene.parts.find((p) => p.id === link.to)!.at
  let cells: Pt[]
  if (link.via) cells = [from, ...link.via, to]
  else if (from[0] === to[0] || from[1] === to[1]) cells = [from, to]
  else if (link.bend === 'vh') cells = [from, [from[0], to[1]], to]
  else cells = [from, [to[0], from[1]], to]
  const pts = cells.map(cellToPx)

  // two links running both ways between the same parts (charge / discharge)
  // sit side by side rather than on top of each other
  const twin = scene.links.some((l) => l.from === link.to && l.to === link.from)
  if (twin && apart && pts.length === 2) {
    const [[x1, y1], [x2, y2]] = pts as [Pt, Pt]
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const nx = (-(y2 - y1) / len) * 5
    const ny = ((x2 - x1) / len) * 5
    return [
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
    ]
  }
  return pts
}

/** a polyline as a path with softly rounded corners */
export function roundedPath(pts: Pt[], r = 18): string {
  if (pts.length < 2) return ''
  const [x0, y0] = pts[0]!
  let d = `M${x0} ${y0}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]!
    const [x, y] = pts[i]!
    const [nx, ny] = pts[i + 1]!
    const l1 = Math.hypot(x - px, y - py)
    const l2 = Math.hypot(nx - x, ny - y)
    const k = Math.min(r, l1 / 2, l2 / 2)
    const ax = x - ((x - px) / (l1 || 1)) * k
    const ay = y - ((y - py) / (l1 || 1)) * k
    const bx = x + ((nx - x) / (l2 || 1)) * k
    const by = y + ((ny - y) / (l2 || 1)) * k
    d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`
  }
  const [xn, yn] = pts[pts.length - 1]!
  return `${d} L${xn} ${yn}`
}

/**
 * Where to hang an arrow and a value on a link: the middle of its longest
 * visible segment (the ends are hidden under the parts), and which way it runs.
 */
export function linkAnchor(pts: Pt[]): { x: number; y: number; angle: number } {
  let best = 0
  let at = { x: pts[0]![0], y: pts[0]![1], angle: 0 }
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len > best) {
      best = len
      at = {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
        angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
      }
    }
  }
  return at
}
