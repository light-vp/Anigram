// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Pt } from './geometry.ts'
import type { LineType, LinkSpec, PartSpec } from '../sim/types.ts'

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
