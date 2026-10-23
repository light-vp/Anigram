// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Scene } from '../sim/types.ts'
import { simulateDay } from './report.ts'
import { checkRequirements, phraseRequirement } from './requires.ts'
import { applyLevers, leversFor, sizeScene } from './sizing.ts'
import { validateScene } from './validate.ts'

// a 60 m³/h pump filling a 200 m³ tank that a plant draws 80 m³/h from, all day
const plant = (requires: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'plant',
  title: 'A pump, a tank and a plant',
  size: [6, 3],
  units: {
    water: { rate: 'm³/h', amount: 'm³' },
    electric: { rate: 'kW', amount: 'kWh' },
  },
  scale: { water: 100, electric: 40 },
  clock: { start: 0, rate: 1 },
  parts: [
    {
      id: 'river',
      kind: 'river',
      label: 'River',
      at: [0, 1],
      behaviour: { role: 'source', output: 500 },
    },
    {
      id: 'mains',
      kind: 'grid',
      label: 'Mains',
      at: [1, 2],
      behaviour: { role: 'source', output: 40 },
    },
    {
      id: 'pump',
      kind: 'pump',
      label: 'Pump',
      at: [1, 1],
      behaviour: {
        role: 'converter',
        output: 'water',
        recipe: { water: 1, electric: 0.25 },
        capacity: 60,
      },
    },
    {
      id: 'tank',
      kind: 'reservoir',
      label: 'Tank',
      at: [3, 1],
      behaviour: {
        role: 'storage',
        capacity: 200,
        start: 0.5,
        maxIn: 150,
        maxOut: 150,
        refill: { below: 0.95, until: 1 },
      },
    },
    {
      id: 'works',
      kind: 'factory',
      label: 'Works',
      at: [5, 1],
      behaviour: { role: 'sink', demand: 80 },
    },
  ],
  links: [
    { from: 'river', to: 'pump', domain: 'water' },
    { from: 'mains', to: 'pump', domain: 'electric' },
    { from: 'pump', to: 'tank', domain: 'water' },
    { from: 'tank', to: 'works', domain: 'water' },
  ],
  requires,
  ...extra,
})

const load = (requires: unknown[], extra?: Record<string, unknown>): Scene => {
  const v = validateScene(plant(requires, extra))
  assert.deepEqual(v.errors, [])
  return v.scene!
}

const check = (scene: Scene) => checkRequirements(scene, simulateDay(scene))

test('a requirement says yes or no, with how close the day came', () => {
  const [served, dry, pump] = check(
    load([
      { part: 'works', reads: 'served', min: 1 },
      { part: 'tank', reads: 'fill', min: 0.02 },
      { part: 'pump', reads: 'out', max: 60 },
    ]),
  )
  assert.equal(served!.says, 'Works always gets what it asks for')
  assert.equal(served!.ok, false)
  assert.match(
    served!.answer,
    /^no · down to \d+% at \d\d:00, \d+ of 24 hours$/,
  )
  assert.ok(served!.failed.length > 10, 'the tank empties by mid-morning')
  assert.equal(dry!.says, 'Tank never runs dry')
  assert.equal(dry!.ok, false)
  assert.equal(pump!.ok, true)
  assert.match(pump!.answer, /^yes · highest 60 m³\/h/)
})

test('a day’s total, and a window of hours', () => {
  const [total, morning] = check(
    load([
      { part: 'works', reads: 'in', per: 'day', min: 1400 },
      { part: 'works', reads: 'served', min: 1, from: 1, to: 3 },
    ]),
  )
  assert.equal(total!.says, 'Works gets at least 1,400 m³ a day')
  assert.equal(total!.ok, true)
  assert.match(total!.answer, /over the day$/)
  assert.equal(morning!.says, 'Works gets what it asks for from 01:00 to 03:00')
  assert.equal(morning!.ok, true)
  assert.deepEqual(morning!.hours, [1, 2, 3])
})

test('requirements are phrased from their fields', () => {
  const scene = load([])
  const say = (r: Record<string, unknown>) =>
    phraseRequirement(scene, { part: 'tank', reads: 'fill', ...r })
  assert.equal(say({ min: 0.2 }), 'Tank stays above 20% full')
  assert.equal(say({ max: 0.99 }), 'Tank never fills up')
  assert.equal(
    say({ min: 0.2, max: 0.9 }),
    'Tank stays between 20% and 90% full',
  )
  assert.equal(
    phraseRequirement(scene, { part: 'pump', reads: 'out', min: 40, at: 9 }),
    'Pump delivers at least 40 m³/h at 09:00',
  )
})

test('the validator holds requirements to the parts they name', () => {
  const errors = (r: unknown) => validateScene(plant([r])).errors
  assert.match(
    errors({ part: 'tnak', reads: 'fill', min: 0.1 })[0]!,
    /did you mean "tank"/,
  )
  assert.match(
    errors({ part: 'tank', reads: 'level', min: 0.1 })[0]!,
    /must be one of served/,
  )
  assert.match(
    errors({ part: 'pump', reads: 'fill', min: 0.1 })[0]!,
    /is for a store/,
  )
  assert.match(
    errors({ part: 'tank', reads: 'served', min: 1 })[0]!,
    /is for a sink/,
  )
  assert.match(
    errors({ part: 'tank', reads: 'fill', min: 15 })[0]!,
    /15% is 0.15/,
  )
  assert.match(
    errors({ part: 'tank', reads: 'fill' })[0]!,
    /give a min, a max, or both/,
  )
  assert.match(
    errors({ part: 'tank', reads: 'fill', min: 0.1, per: 'day' })[0]!,
    /of a flow/,
  )
  assert.deepEqual(
    errors({ part: 'works', reads: 'in', min: 10, per: 'day' }),
    [],
  )
})

test('sizing finds the pump the works needs, and the power it takes', () => {
  const scene = load([{ part: 'works', reads: 'served', min: 1 }])
  const s = sizeScene(scene)
  assert.deepEqual(s.failing, ['Works always gets what it asks for'])
  assert.ok(s.options.length > 0)
  const pump = s.options
    .flatMap((o) => o.changes)
    .find((c) => c.part === 'pump' && c.field === 'capacity')
  assert.ok(pump, 'a bigger pump is one of the answers')
  assert.equal(pump.value, 60)
  assert.ok(pump.to! >= 75 && pump.to! <= 85, `pump to ${pump.to}`)
  assert.match(pump.text, /^Pump capacity 60 → \d+ m³\/h \(\+\d+%\)$/)
  const option = s.options.find((o) => o.changes.includes(pump))!
  assert.match(
    option.needs[0]!,
    /^Pump takes up to \d+ kW of electric power at that size \(now 15 kW\)$/,
  )
  // every answer it gives holds when checked again
  for (const o of s.options) assert.ok(check(o.scene).every((r) => r.ok))
})

test('a pump held back by its power supply is sized with it', () => {
  // 15 kW runs the pump at 60 m³/h, so a bigger pump alone does nothing
  const base = plant([{ part: 'works', reads: 'served', min: 1 }])
  base.parts[1]!.behaviour = { role: 'source', output: 15 }
  const scene = validateScene(base).scene!
  const s = sizeScene(scene)
  const both = s.options.find((o) => o.changes.length > 1)
  assert.ok(both, sizingSummary(s.options))
  assert.deepEqual(both.changes.map((c) => c.part).sort(), ['mains', 'pump'])
  assert.ok(check(both.scene).every((r) => r.ok))
})

const sizingSummary = (o: Array<{ changes: Array<{ text: string }> }>) =>
  o.map((x) => x.changes.map((c) => c.text).join('; ')).join(' | ') || 'none'

test('a ceiling is met by making something smaller, a floor never is', () => {
  const s = sizeScene(load([{ part: 'pump', reads: 'out', max: 40 }]))
  assert.ok(s.options.length)
  for (const o of s.options) for (const c of o.changes) assert.ok(c.factor < 1)
  const floor = sizeScene(load([{ part: 'tank', reads: 'fill', min: 0.3 }]))
  for (const o of floor.options)
    for (const c of o.changes) assert.ok(c.factor > 1)
})

test('nothing to size when every requirement holds', () => {
  const s = sizeScene(load([{ part: 'pump', reads: 'out', max: 100 }]))
  assert.deepEqual(s.failing, [])
  assert.equal(s.runs, 1)
})

test('an expression is scaled where it stands', () => {
  const scene = load([{ part: 'works', reads: 'served', min: 1 }])
  const river = leversFor(scene, scene.requires![0]!).find(
    (l) => l.part === 'river',
  )!
  const withExpr = {
    ...scene,
    parts: scene.parts.map((p) =>
      p.id === 'river'
        ? { ...p, behaviour: { role: 'source' as const, output: '50 + hour' } }
        : p,
    ),
  }
  const out = applyLevers(withExpr, [
    { lever: { ...river, value: null }, k: 1.5 },
  ])
  const b = out.parts.find((p) => p.id === 'river')!.behaviour
  assert.equal(b.role === 'source' && b.output, '1.5 * (50 + hour)')
})
