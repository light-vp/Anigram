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
