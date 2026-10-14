// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * How long one tick takes on a big sheet: `npm run bench [feeders] [houses]`.
 * The default town is 288 parts; the plan's budget is 2 ms a tick at 300.
 */

import { compile, initialMemory, solve } from '../src/sim/solver.ts'
import { town } from '../src/sim/town.ts'
import type { Env } from '../src/sim/types.ts'

const scene = town(Number(process.argv[2] ?? 20), Number(process.argv[3] ?? 12))
const model = compile(scene)
const memory = initialMemory(model)
const env = (hour: number): Env => ({
  hour,
  day: 0,
  knob: () => 0.5,
  on: () => true,
  prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
})
const STEP = 1 / 30
for (let i = 0; i < 24 * 30; i++) solve(model, env(i * STEP), STEP, memory)
const ticks = 24 * 30 * 3
const t = performance.now()
for (let i = 0; i < ticks; i++) solve(model, env((i * STEP) % 24), STEP, memory)
const ms = (performance.now() - t) / ticks
console.log(
  `${scene.parts.length} parts, ${scene.links.length} links: ${ms.toFixed(3)} ms a tick`,
)
