// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { dataCentre } from './dataCentre.ts'
import { grid } from './grid.ts'
import { hydroDam } from './hydroDam.ts'
import { solarHome } from './solarHome.ts'
import { waterTower } from './waterTower.ts'
import type { Scene } from '../sim/types.ts'

/** the curated scenes, in the order the picker shows them */
export const SCENES: readonly Scene[] = [
  grid,
  solarHome,
  waterTower,
  hydroDam,
  dataCentre,
]

/**
 * Scene ids from the cloud-architecture version, still linked from the
 * portfolio's embeds — each maps to the closest new scene.
 */
const LEGACY: Record<string, string> = {
  cdn: 'data-centre',
  microservices: 'grid',
  oauth2: 'solar-home',
}

export function findScene(id: string | null | undefined): Scene {
  const key = id ? (LEGACY[id] ?? id) : undefined
  return SCENES.find((s) => s.id === key) ?? SCENES[0]!
}
