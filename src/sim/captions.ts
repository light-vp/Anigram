// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Scene } from './types.ts'

/** the scene's caption for this hour, if it has one */
export function captionAt(scene: Scene, hour: number): string | null {
  for (const c of scene.captions ?? []) {
    const inside =
      c.from <= c.to
        ? hour >= c.from && hour < c.to
        : hour >= c.from || hour < c.to
    if (inside) return c.text
  }
  return null
}

/** how long an event's words stay up after it fires, in simulated hours */
export const EVENT_CAPTION_HOURS = 0.75

/**
 * what the sheet says right now: the last event that fired, while it is
 * fresh, else the caption for the hour
 */
export function frameCaption(
  scene: Scene,
  frame: { hour: number; events?: Record<string, { since: number }> },
): string | null {
  let best: { says: string; since: number } | null = null
  for (const e of scene.events ?? []) {
    const since = frame.events?.[e.id]?.since ?? Infinity
    if (since <= EVENT_CAPTION_HOURS && !(best && best.since <= since))
      best = { says: e.says, since }
  }
  return best?.says ?? captionAt(scene, frame.hour)
}
