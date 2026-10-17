// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { exprRefs } from '../sim/expr.ts'
import type { Scene } from '../sim/types.ts'

/* An event chain's cause and effect, read from the scene: what the sheet draws as arrows. */
export interface ChainEdge {
  /** the event that causes */
  from: string
  /** the event that waits on it; absent for an arrow to what an event switches */
  to?: string
  /** the part each end sits at */
  a: string
  b: string
}

/**
 * The chain's arrows: from each event to the event that waits on it with
 * `fired()` or `since()`, always drawn; and from each event to the parts
 * its switches work, drawn only as it fires — the cause reaching out to its
 * effect.
 */
export function chainEdges(scene: Scene): ChainEdge[] {
  const at = new Map((scene.events ?? []).map((e) => [e.id, e.at]))
  const out: ChainEdge[] = []
  const seen = new Set<string>()
  const add = (edge: ChainEdge) => {
    const key = `${edge.from}>${edge.to ?? ''}>${edge.b}`
    if (edge.a === edge.b || seen.has(key)) return
    seen.add(key)
    out.push(edge)
  }
  for (const e of scene.events ?? []) {
    if (!e.at) continue
    let refs: Set<string>
    try {
      refs = exprRefs(e.when).events
    } catch {
      refs = new Set()
    }
    for (const id of refs) {
      const a = at.get(id)
      if (a) add({ from: id, to: e.id, a, b: e.at })
    }
    for (const act of e.then) {
      if (!('switch' in act)) continue
      for (const p of scene.parts)
        if (p.toggles === act.switch) add({ from: e.id, a: e.at, b: p.id })
    }
  }
  return out
}
