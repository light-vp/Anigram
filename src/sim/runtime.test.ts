// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { advance } from '../format/report.ts'
import { SCENES } from '../scenes/index.ts'
import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import { Simulation } from './runtime.ts'

const solarHome = SCENES.find((s) => s.id === 'solar-home')!
const fill = (sim: Simulation, id: string) => sim.frame.parts[id]!.fill

test('seeking replays the day, so a store shows the level it would really have', () => {
  const opening = new Simulation(solarHome)
  const sought = new Simulation(solarHome)
  sought.seek(18)

  // the same day, played through rather than jumped to
  const played = new Simulation(solarHome)
  played.animate = false
  advance(played, 18 - solarHome.clock.start)

  assert.equal(sought.hour, 18)
  assert.notEqual(fill(sought, 'battery'), fill(opening, 'battery'))
  for (const p of solarHome.parts) {
    const a = sought.frame.parts[p.id]!
    const b = played.frame.parts[p.id]!
    assert.ok(Math.abs(a.level - b.level) < 1e-6, `${p.id} level`)
    assert.ok(Math.abs(a.in - b.in) < 1e-6, `${p.id} in`)
    assert.ok(Math.abs(a.out - b.out) < 1e-6, `${p.id} out`)
  }
})

test('seeking back and forth lands on the same frame every time', () => {
  const sim = new Simulation(solarHome)
  sim.seek(20.5)
  const first = structuredClone(sim.frame.parts)
  sim.seek(9)
  sim.seek(3) // past midnight: the small hours after the opening day
  sim.seek(20.5)
  assert.deepEqual(sim.frame.parts, first)
  assert.equal(sim.hour, 20.5)
})

test('a seek after a control changes replays the day under the new setting', () => {
  const sim = new Simulation(solarHome)
  sim.seek(18)
  const sunny = fill(sim, 'battery')
  sim.setKnob('cloud', 1)
  sim.seek(18)

  const fresh = new Simulation(solarHome)
  fresh.setKnob('cloud', 1)
  fresh.seek(18)

  assert.ok(
    fill(sim, 'battery') < sunny,
    'a cloudy day leaves less in the battery',
  )
  assert.equal(fill(sim, 'battery'), fill(fresh, 'battery'))
})

test('seeking to the opening hour is the scene as it opens', () => {
  const sim = new Simulation(solarHome)
  sim.seek(15)
  sim.seek(solarHome.clock.start)
  const opening = new Simulation(solarHome)
  assert.deepEqual(sim.frame.parts, opening.frame.parts)
})

test("a loop reading a store's level opens the day on the level it starts with", () => {
  const scene = validateScene(STARTERS.pid).scene!
  const sim = new Simulation(scene)
  // the starter's valve opens with the tank above 20%; it starts at 60%
  assert.ok(sim.frame.parts.lv!.open > 0.99, `open ${sim.frame.parts.lv!.open}`)
  assert.ok(sim.frame.parts.user!.in > 0)
})
