// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LinkState } from '../sim/solver.ts'
import type { Scene } from '../sim/types.ts'

const LIVE = 1e-6

/**
 * Everything a part's flow comes from and goes to *right now*: walk upstream
 * along links that are carrying something, then downstream the same way.
 * Selecting a house lights the chain that is powering it this instant.
 */
export function trace(
  scene: Scene,
  links: LinkState[],
  id: string,
): { parts: Set<string>; links: Set<number> } {
  const parts = new Set<string>([id])
  const lit = new Set<number>()
  const walk = (start: string, upstream: boolean) => {
    const queue = [start]
    const seen = new Set<string>([start])
    while (queue.length) {
      const at = queue.shift()!
      scene.links.forEach((l, i) => {
        if ((links[i]?.flow ?? 0) <= LIVE) return
        const near = upstream ? l.to : l.from
        const far = upstream ? l.from : l.to
        if (near !== at) return
        lit.add(i)
        parts.add(far)
        if (!seen.has(far)) {
          seen.add(far)
          queue.push(far)
        }
      })
    }
  }
  walk(id, true)
  walk(id, false)
  return { parts, links: lit }
}
