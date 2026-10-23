// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import distillation from '../../examples/distillation-pid.json' with { type: 'json' }
import feedTank from '../../examples/feed-tank-pid.json' with { type: 'json' }
import hydraulicPress from '../../examples/hydraulic-press.json' with { type: 'json' }
import narrowboat from '../../examples/narrowboat.json' with { type: 'json' }
import rainwater from '../../examples/rainwater-pid.json' with { type: 'json' }
import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import { SCENES } from '../scenes/index.ts'
import type { DrawingType, Scene } from '../sim/types.ts'

/*
 * Every example sheet Anigram ships, for the gallery: the built-in sheets,
 * the scene files in examples/ (some of them written by an assistant through
 * the MCP server), and the starter each drawing practice opens on. A built-in
 * sheet opens by name; anything else rides whole in its link.
 */

export interface Example {
  scene: Scene
  /** the file as it is, for a `#scene=` link; absent for a built-in sheet */
  file?: unknown
  /** where it came from, said on its card */
  origin: 'built-in' | 'example' | 'assistant' | 'starter'
  /** the hour its thumbnail is drawn at */
  hour: number
}

const fromFile = (
  raw: unknown,
  origin: Example['origin'],
  hour?: number,
): Example => {
  const v = validateScene(raw)
  if (!v.scene) throw new Error(`examples: ${v.errors.join('; ')}`)
  return {
    scene: v.scene,
    file: raw,
    origin,
    hour: hour ?? v.scene.clock.start,
  }
}

/** hours that catch each built-in sheet doing something worth a thumbnail */
const BUILT_IN_HOUR: Record<string, number> = {
  grid: 19,
  'solar-home': 12.5,
  'water-tower': 7.5,
  'hydro-dam': 18,
  'data-centre': 14,
  'garden-machine': 13,
}

export const EXAMPLES: Example[] = [
  ...SCENES.map((scene) => ({
    scene,
    origin: 'built-in' as const,
    hour: BUILT_IN_HOUR[scene.id] ?? scene.clock.start,
  })),
  fromFile(rainwater, 'assistant', 8),
  fromFile(feedTank, 'example', 12),
  fromFile(distillation, 'example', 12),
  fromFile(hydraulicPress, 'example'),
  fromFile(narrowboat, 'example', 12),
  fromFile(STARTERS['single-line'], 'starter', 12),
  fromFile(STARTERS.pfd, 'starter', 12),
]

export const DRAWING_LABEL: Record<DrawingType, string> = {
  pictorial: 'Pictorial',
  pid: 'P&ID',
  'single-line': 'Single-line',
  pfd: 'PFD',
  'fluid-power': 'Fluid power',
}

export const ORIGIN_LABEL: Record<Example['origin'], string> = {
  'built-in': 'Built in',
  example: 'Scene file',
  assistant: 'Written by an assistant',
  starter: 'Starter',
}

export const drawingOf = (s: Scene): DrawingType => s.drawing ?? 'pictorial'
