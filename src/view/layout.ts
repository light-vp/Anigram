// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LabelSide, PartSpec } from '../sim/types.ts'
import { cellToPx, linkAnchor } from './geometry.ts'
import type { Pt } from './geometry.ts'

/*
 * Where the words go. SVG text can't measure itself before it's drawn, so
 * widths are estimated from character counts in the sheet's monospace font —
 * close enough to keep labels and flow tags from landing on each other.
 */

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const LABEL_OFFSET: Record<
  LabelSide,
  { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }
> = {
  below: { dx: 0, dy: 50, anchor: 'middle' },
  above: { dx: 0, dy: -60, anchor: 'middle' },
  right: { dx: 44, dy: -4, anchor: 'start' },
  left: { dx: -44, dy: -4, anchor: 'end' },
}

/** a part's label block, relative to its label origin */
export function labelRect(
  part: PartSpec,
  value: string,
): { x: number; y: number; w: number; h: number } {
  const o = LABEL_OFFSET[part.labelSide ?? 'below']
  const w = Math.max(part.label.length * 7.4, value.length * 6.6) + 8
  const x = o.anchor === 'middle' ? -w / 2 : o.anchor === 'start' ? -4 : -w + 4
  return { x, y: -11, w, h: 29 }
}

/** the same block, on the sheet */
export function labelBox(part: PartSpec, value: string): Box {
  const [cx, cy] = cellToPx(part.at)
  const o = LABEL_OFFSET[part.labelSide ?? 'below']
  const r = labelRect(part, value)
  const x0 = cx + o.dx + r.x
  const y0 = cy + o.dy + r.y
  return { x0, y0, x1: x0 + r.w, y1: y0 + r.h }
}

export function glyphBox(part: PartSpec): Box {
  const [cx, cy] = cellToPx(part.at)
  return { x0: cx - 36, y0: cy - 36, x1: cx + 36, y1: cy + 36 }
}

const hits = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

export interface Tag {
  link: number
  text: string
  /** the arrow, on the link */
  at: { x: number; y: number; angle: number }
  /** the value pill's centre, nudged clear of everything else */
  cx: number
  cy: number
  w: number
}

/**
 * Paper mode labels every flow. Each value pill tries a few spots beside its
 * link's longest run and takes the first that doesn't cover a part, a label,
 * or a pill already placed.
 */
export function placeTags(
  items: Array<{ link: number; pts: Pt[]; text: string }>,
  obstacles: Box[],
): Tag[] {
  // an arrow slides along its link until it's clear of labels and parts...
  const anchors = items.map((it) => {
    const a = linkAnchor(it.pts)
    const ux = Math.cos((a.angle * Math.PI) / 180)
    const uy = Math.sin((a.angle * Math.PI) / 180)
    for (const t of [0, 14, -14, 28, -28, 42, -42]) {
      const x = a.x + ux * t
      const y = a.y + uy * t
      if (
        !obstacles.some((o) =>
          hits(o, { x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }),
        )
      )
        return { ...a, x, y }
    }
    return a
  })
  // ...and since it sits on its link whatever happens, pills keep off every arrow
  const taken = [
    ...obstacles,
    ...anchors.map((a) => ({
      x0: a.x - 9,
      y0: a.y - 9,
      x1: a.x + 9,
      y1: a.y + 9,
    })),
  ]
  const tags: Tag[] = []
  for (const [k, { link, text }] of items.entries()) {
    const at = anchors[k]!
    const w = text.length * 6.2 + 10
    const vertical = Math.abs(Math.abs(at.angle) - 90) < 1
    const side = w / 2 + 9
    const spots: Array<[number, number]> = vertical
      ? [
          [side, 0],
          [-side, 0],
          [side, -24],
          [-side, 24],
          [side, 24],
          [-side, -24],
          [side, -44],
          [-side, 44],
          [side + 40, 0],
          [-side - 40, 0],
        ]
      : [
          [0, -15],
          [0, 15],
          [-34, -15],
          [34, -15],
          [-34, 15],
          [34, 15],
          [-64, -15],
          [64, 15],
          [0, -32],
          [0, 32],
        ]
    let best: Tag | null = null
    for (const [dx, dy] of spots) {
      const cx = at.x + dx
      const cy = at.y + dy
      const box = {
        x0: cx - w / 2 - 2,
        y0: cy - 10,
        x1: cx + w / 2 + 2,
        y1: cy + 10,
      }
      const tag = { link, text, at, cx, cy, w }
      if (!best) best = tag
      if (!taken.some((t) => hits(t, box))) {
        best = tag
        break
      }
    }
    const t = best!
    taken.push({
      x0: t.cx - t.w / 2 - 2,
      y0: t.cy - 10,
      x1: t.cx + t.w / 2 + 2,
      y1: t.cy + 10,
    })
    tags.push(t)
  }
  return tags
}
