// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf } from '../packs/catalogue.ts'
import type { Frame } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'

/*
 * A static drawing shows the plant, not a moment of it. An engineering
 * drawing is drawn at rest the way its standard draws it: vessels empty,
 * valves open, directional valves on their springs, relief valves and
 * bursting discs shut, check valves seated, every line carrying its arrow
 * and nothing reading anything. The parts keep their own frame so a symbol
 * that has no rest state still draws.
 */

/** the classes whose rest position is shut: ISO 1219 draws a directional valve on its spring */
const SHUT_AT_REST = /^(DirectionalValve|ReliefValve$|RuptureDisc$)/

export function restFrame(scene: Scene, frame: Frame): Frame {
  const parts: Frame['parts'] = {}
  const partPhase: Frame['partPhase'] = {}
  for (const p of scene.parts) {
    const s = frame.parts[p.id]
    if (!s) continue
    parts[p.id] = {
      ...s,
      in: 0,
      out: 0,
      level: 0,
      fill: 0,
      loss: 0,
      starting: false,
      // full strength: nothing drawn faint for being idle
      activity: 1,
      open: SHUT_AT_REST.test(classOf(p, scene) ?? '') ? 0 : 1,
      effort: NaN,
      effortIn: NaN,
    }
    partPhase[p.id] = 0
  }
  return {
    ...frame,
    parts,
    partPhase,
    // a line on a drawing carries its arrow whether or not anything flows
    links: frame.links.map(() => ({
      flow: 1,
      capacity: Infinity,
      effortFrom: NaN,
      effortTo: NaN,
    })),
    linkPhase: new Float64Array(frame.linkPhase.length),
    alerts: [],
    instruments: {},
    events: {},
  }
}
