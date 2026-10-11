// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf } from '../packs/catalogue.ts'
import { cellToPx } from './geometry.ts'
import type { Pt } from './geometry.ts'
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
