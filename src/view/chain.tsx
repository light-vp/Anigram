// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Frame } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'
import { TILE, cellToPx } from './geometry.ts'
import type { Pt } from './geometry.ts'
import type { ChainEdge } from './chainEdges.ts'

/*
 * An event chain on the sheet: a thin arrow from each event's part to the
 * part of the event that waits on it, and a ring that flares where an event
 * fires and fades over the next half hour. The arrows are the machine's
 * cause and effect; the rings show which link of it just moved.
 */

/** simulated hours a fired event's ring takes to fade */
const RING_HOURS = 0.5

/** a gentle arc from one part to another, clear of both glyphs */
function arc(p: Pt, q: Pt): { d: string } {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
  const len = Math.hypot(dx, dy) || 1
  const [ux, uy] = [dx / len, dy / len]
  const clear = TILE / 2 + 10
  const s: Pt = [p[0] + ux * clear, p[1] + uy * clear]
  const e: Pt = [q[0] - ux * clear, q[1] - uy * clear]
  // bow to the left of travel, clear of a straight line between the two
  const bow = Math.min(60, Math.max(26, len * 0.2))
  const c: Pt = [(s[0] + e[0]) / 2 + uy * bow, (s[1] + e[1]) / 2 - ux * bow]
  return { d: `M${s[0]},${s[1]} Q${c[0]},${c[1]} ${e[0]},${e[1]}` }
}

export function ChainArrows({
  scene,
  frame,
  edges,
}: {
  scene: Scene
  frame: Frame
  edges: ChainEdge[]
}) {
  if (!edges.length) return null
  const parts = new Map(scene.parts.map((p) => [p.id, p]))
  return (
    <g className="chain" aria-hidden="true">
      <defs>
        <marker
          id="chain-head"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M1,1 L7,4 L1,7" fill="none" stroke="context-stroke" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const a = parts.get(edge.a)
        const b = parts.get(edge.b)
        if (!a || !b) return null
        const cause = frame.events?.[edge.from]
        const fresh = cause !== undefined && cause.since <= RING_HOURS
        const d = arc(cellToPx(a.at), cellToPx(b.at)).d
        if (!edge.to) {
          // a reach to what it switches shows only as it happens, and fades
          if (!fresh) return null
          return (
            <path
              key={`${edge.from}>${edge.b}`}
              className="chainArrow live"
              d={d}
              opacity={1 - cause.since / RING_HOURS}
              markerEnd="url(#chain-head)"
            />
          )
        }
        const next = frame.events?.[edge.to]
        // lit from the moment the cause fires until the effect has followed
        const live =
          !!next?.waiting || (fresh && !(next && next.since < cause.since))
        return (
          <path
            key={`${edge.from}>${edge.to}`}
            className={live ? 'chainArrow live' : 'chainArrow'}
            d={d}
            markerEnd="url(#chain-head)"
          />
        )
      })}
    </g>
  )
}

export function ChainRings({ scene, frame }: { scene: Scene; frame: Frame }) {
  const parts = new Map(scene.parts.map((p) => [p.id, p]))
  const rings = (scene.events ?? []).flatMap((e) => {
    const since = frame.events?.[e.id]?.since ?? Infinity
    const part = e.at ? parts.get(e.at) : undefined
    if (!part || !(since < RING_HOURS)) return []
    return [{ id: e.id, at: cellToPx(part.at), t: since / RING_HOURS }]
  })
  if (!rings.length) return null
  return (
    <g className="chain" aria-hidden="true" pointerEvents="none">
      {rings.map((r) => (
        <circle
          key={r.id}
          className="chainRing"
          cx={r.at[0]}
          cy={r.at[1]}
          r={TILE / 2 + 6 + 14 * r.t}
          opacity={1 - r.t}
        />
      ))}
    </g>
  )
}
