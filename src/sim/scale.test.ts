// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile, initialMemory, solve } from './solver.ts'
import { town } from './town.ts'
import type { Env } from './types.ts'

/*
 * Real drawings get big. The budget is 2 ms a tick at 300 parts on a
 * laptop; these bounds are looser so a slow CI runner doesn't flake, but
 * still catch the solver going back to walking every ask from scratch.
 */

const env = (hour: number): Env => ({
  hour,
  day: 0,
  knob: () => 0.5,
  on: () => true,
  prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
})

function day(feeders: number, houses: number) {
  const scene = town(feeders, houses)
  const model = compile(scene)
  const memory = initialMemory(model)
  const step = 1 / 30
  const t = performance.now()
  let last
  for (let i = 0; i < 24 * 30; i++)
    last = solve(model, env(i * step), step, memory)
  return { scene, ms: (performance.now() - t) / (24 * 30), last: last! }
}

test('a 288-part town solves a day quickly', () => {
  const { ms, scene, last } = day(20, 12)
  assert.equal(scene.parts.length, 288)
  assert.ok(ms < 4, `${ms.toFixed(2)} ms a tick`)
  // every bus passes on what it takes
  for (const p of scene.parts)
    if (p.behaviour.role === 'bus') {
      const s = last.parts[p.id]!
      assert.ok(
        Math.abs(s.in - s.out) < 1e-6,
        `${p.id}: ${s.in} in, ${s.out} out`,
      )
    }
})

test('a town short at every feeder still solves quickly, and shares fairly', () => {
  const { ms, scene, last } = day(10, 28)
  assert.ok(scene.parts.length > 300)
  assert.ok(ms < 10, `${ms.toFixed(2)} ms a tick`)
  // on one feeder, every house of one priority gets the same share
  for (let f = 0; f < 10; f++) {
    const shares = new Map<number, number[]>()
    for (const p of scene.parts) {
      const b = p.behaviour
      if (b.role !== 'sink' || !p.id.startsWith(`house${f}_`)) continue
      const s = last.parts[p.id]!
      const pr = b.priority ?? 0
      shares.set(pr, [...(shares.get(pr) ?? []), s.in / s.demand])
    }
    for (const xs of shares.values())
      assert.ok(
        Math.max(...xs) - Math.min(...xs) < 1e-3,
        `feeder ${f}: ${xs.map((x) => x.toFixed(3)).join(' ')}`,
      )
  }
})
