// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf, shownParts, shows } from '../packs/catalogue.ts'
import type { LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import {
  BORDER,
  TILE,
  cellToPx,
  isEngineering,
  linkPoints,
  sheetSize,
} from './geometry.ts'
import type { Pt } from './geometry.ts'
import type { Box } from './layout.ts'
import { busbarSpans, engLabelOffset, engPoints } from './lines.ts'

/*
 * Whether a sheet reads cleanly, from its geometry alone: the same lines the
 * sheet draws, checked for the things a reader trips over. Lines that cross
 * or run on top of each other, a line through a part it doesn't belong to,
 * a slanted run, and words landing on parts or other words. React-free, so
 * the MCP server can say what to move before anything is rendered.
 */

export interface LayoutFinding {
  /** which rule, from LAYOUT_RULES */
  rule: string
  /** what it is about, in the validator's path shape */
  path: string
  /** what is wrong and how to fix it */
  message: string
}

export const LAYOUT_RULES: Record<string, string> = {
  crossing: 'two lines cross',
  overlap: 'two lines run on top of each other',
  'through-part': "a line runs through a part that isn't one of its ends",
  slanted: 'a line runs at a slant rather than across or up and down',
  'label-collision': "a part's words land on another part or its words",
  'label-off-sheet': "a part's words run off the edge of the sheet",
}

/** a nominal reading, for sizing labels before anything has run */
const VALUE = '000.0 kW'

interface Drawn {
  index: number
  link: LinkSpec
  pts: Pt[]
}

/** the links a sheet draws, as it draws them */
export function drawnLinks(scene: Scene): Drawn[] {
  const eng = isEngineering(scene)
  const shown = shownParts(scene)
  return scene.links.flatMap((link, index) => {
    if (eng && (!shows(link, scene) || !shown.has(link.from))) return []
    if (eng && !shown.has(link.to)) return []
    const pts = eng ? engPoints(scene, link) : linkPoints(scene, link)
    return [{ index, link, pts }]
  })
}

const hits = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** where a part's words sit on the sheet, as the sheet sets them */
function labelBoxOf(
  scene: Scene,
  part: PartSpec,
  span?: [number, number],
): Box | undefined {
  const [x, y] = cellToPx(part.at)
  const eng = isEngineering(scene)
  const c = eng ? classOf(part, scene) : undefined
  if (c === 'Junction') return undefined
  const busbar = c === 'Busbar'
  const o = busbar
    ? { dx: (span?.[0] ?? -50) + 4, dy: part.tag ? -22 : -9, anchor: 'start' }
    : engLabelOffset(scene, part)
  const lines = [
    ...(eng && part.tag ? [part.tag] : []),
    part.label,
    ...(busbar ? [] : [VALUE]),
  ]
  const w = Math.max(...lines.map((l) => l.length)) * 6.4 + 4
  const left =
    o.anchor === 'middle' ? -w / 2 : o.anchor === 'start' ? -2 : -w + 2
  const x0 = x + o.dx + left
  const y0 = y + o.dy - 11
  return { x0, y0, x1: x0 + w, y1: y0 + 14 * lines.length }
}

function partBox(scene: Scene, part: PartSpec, span?: [number, number]): Box {
  const [x, y] = cellToPx(part.at)
  if (span && isEngineering(scene) && classOf(part, scene) === 'Busbar')
    return { x0: x + span[0], y0: y - 4, x1: x + span[1], y1: y + 4 }
  const r = TILE / 2 - 4
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }
}

type Seg = [Pt, Pt]
const segs = (pts: Pt[]): Seg[] =>
  pts.slice(1).map((p, i) => [pts[i]!, p] as Seg)
const flat = ([a, b]: Seg) => Math.abs(a[1] - b[1]) < 0.5
const upright = ([a, b]: Seg) => Math.abs(a[0] - b[0]) < 0.5

/** where two segments cross, strictly inside both */
function crossAt([a, b]: Seg, [c, d]: Seg): Pt | undefined {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
  if (Math.abs(den) < 1e-9) return undefined
  const t =
    ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
  const u =
    ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
  const e = 1e-3
  return t > e && t < 1 - e && u > e && u < 1 - e
    ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    : undefined
}

/** how long two segments share the same line, if they do */
function sharedRun([a, b]: Seg, [c, d]: Seg): number {
  if (flat([a, b]) && flat([c, d]) && Math.abs(a[1] - c[1]) < 0.5) {
    const lo = Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]))
    const hi = Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0]))
    return hi - lo
  }
  if (upright([a, b]) && upright([c, d]) && Math.abs(a[0] - c[0]) < 0.5) {
    const lo = Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]))
    const hi = Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
    return hi - lo
  }
  return 0
}

/** whether a segment passes through a box */
function segHits([a, b]: Seg, box: Box): boolean {
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  if (flat([a, b]) || upright([a, b]))
    return hits({ x0: x0 - 0.5, y0: y0 - 0.5, x1: x1 + 0.5, y1: y1 + 0.5 }, box)
  // a slanted run: sample it
  for (let k = 1; k < 24; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / 24
    const y = a[1] + ((b[1] - a[1]) * k) / 24
    if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) return true
  }
  return false
}

const cell = (p: Pt) => {
  const [x, y] = p
  const [x0, y0] = cellToPx([0, 0])
  const r = (v: number) => Math.round(v * 10) / 10
  return `[${r((x - x0) / 120)}, ${r((y - y0) / 120)}]`
}

export function lintLayout(scene: Scene): LayoutFinding[] {
  const out: LayoutFinding[] = []
  const find = (rule: string, path: string, message: string) =>
    out.push({ rule, path, message })
  const drawn = drawnLinks(scene)
  const eng = isEngineering(scene)
  const shown = shownParts(scene)
  const parts = scene.parts.filter((p) => !eng || shown.has(p.id))
  // a cable is drawn as the line itself, so a line can't run through one
  const solid = parts.filter((p) => !eng || classOf(p, scene) !== 'Cable')
  const spans = eng
    ? busbarSpans(
        scene,
        drawn.map((d) => d.link),
        drawn.map((d) => d.pts),
      )
    : new Map<string, [number, number]>()
  const name = (l: LinkSpec) => `${l.from} → ${l.to}`
  const byId = new Map(scene.parts.map((p) => [p.id, p]))
  const path = (d: Drawn) => `links[${d.index}] (${name(d.link)})`
  const shares = (a: LinkSpec, b: LinkSpec) =>
    a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to

  for (const d of drawn)
    if (segs(d.pts).some((s) => !flat(s) && !upright(s)))
      find(
        'slanted',
        path(d),
        `${name(d.link)} runs at a slant; put its ends in the same row or column, or route it with "via" corners`,
      )

  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i]!
      const b = drawn[j]!
      // a pair running both ways between two parts is one line on purpose
      if (a.link.from === b.link.to && a.link.to === b.link.from) continue
      let at: Pt | undefined
      let run = 0
      const ends = [a.link.from, a.link.to, b.link.from, b.link.to].map((id) =>
        partBox(scene, byId.get(id)!, spans.get(id)),
      )
      for (const s of segs(a.pts))
        for (const t of segs(b.pts)) {
          const x = crossAt(s, t)
          // lines leaving one part, or meeting under a part's drawing, join
          // there rather than cross
          if (
            x &&
            !shares(a.link, b.link) &&
            !ends.some(
              (b) => x[0] > b.x0 && x[0] < b.x1 && x[1] > b.y0 && x[1] < b.y1,
            )
          )
            at ??= x
          if (!shares(a.link, b.link)) run = Math.max(run, sharedRun(s, t))
        }
      if (at)
        find(
          'crossing',
          path(a),
          `${name(a.link)} crosses ${name(b.link)} near ${cell(at)}; move a part so they don't, or route one round with "via"`,
        )
      else if (run > 8)
        find(
          'overlap',
          path(a),
          `${name(a.link)} runs on top of ${name(b.link)} for ${Math.round(run)} px, so they read as one line; move one over a row or column, or route it with "via"`,
        )
    }

  for (const d of drawn) {
    const through = solid.filter(
      (p) =>
        p.id !== d.link.from &&
        p.id !== d.link.to &&
        segs(d.pts).some((s) => segHits(s, partBox(scene, p, spans.get(p.id)))),
    )
    for (const p of through)
      find(
        'through-part',
        path(d),
        `${name(d.link)} runs through ${p.id} at [${p.at.join(', ')}]; move ${p.id} off the line, or route the link round it with "via"`,
      )
  }

  // an engineering sheet's border is the edge of the drawing
  const { w } = sheetSize(scene)
  const edge = isEngineering(scene) ? BORDER : 0
  const labels = parts.map((p) => ({
    p,
    box: labelBoxOf(scene, p, spans.get(p.id)),
  }))
  for (const { p, box } of labels) {
    if (!box) continue
    if (box.x0 < edge || box.x1 > w - edge)
      find(
        'label-off-sheet',
        `parts (${p.id})`,
        `${p.id}'s label runs off the ${box.x0 < edge ? 'left' : 'right'} edge of the sheet; set its "labelSide" to ${box.x0 < edge ? '"right"' : '"left"'}, "above" or "below", or move it in from the edge`,
      )
    const on = [
      ...parts
        .filter((q) => q !== p && hits(box, partBox(scene, q, spans.get(q.id))))
        .map((q) => q.id),
      ...labels
        .filter((o) => o.p !== p && o.box && hits(box, o.box) && o.p.id < p.id)
        .map((o) => `${o.p.id}'s label`),
    ]
    if (on.length)
      find(
        'label-collision',
        `parts (${p.id})`,
        `${p.id}'s label lands on ${on.join(', ')}; set its "labelSide" (above, below, left, right) or move it`,
      )
  }
  return out
}
