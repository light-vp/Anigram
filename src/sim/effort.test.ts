// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile, initialMemory, solve } from './solver.ts'
import type { Behaviour, Env, LinkSpec, PartSpec, Scene } from './types.ts'

const env: Env = {
  hour: 12,
  day: 0,
  knob: () => 0,
  on: () => true,
  prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
}

const part = (
  id: string,
  behaviour: Behaviour,
  effort?: PartSpec['effort'],
): PartSpec => ({ id, kind: 'x', label: id, at: [0, 0], behaviour, effort })

function scene(parts: PartSpec[], links: LinkSpec[]): Scene {
  return {
    id: 't',
    title: 't',
    subtitle: '',
    sheet: '',
    size: [4, 4],
    units: {},
    scale: {},
    parts,
    links,
    clock: { start: 0, rate: 1 },
  }
}

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≠ ${b}`)

function run(s: Scene, ticks = 1, dt = 1 / 30) {
  const model = compile(s)
  const memory = initialMemory(model)
  let sol = solve(model, env, dt, memory)
  for (let i = 1; i < ticks; i++) sol = solve(model, env, dt, memory)
  return sol
}

test('a cable loses voltage in proportion to what it carries', () => {
  // a 240 V supply down a street: each span drops 8 V at its 30 kW rating
  const s = scene(
    [
      part('grid', { role: 'source', output: 100 }, { set: 240 }),
      part('pole1', { role: 'bus' }),
      part('pole2', { role: 'bus' }),
      part('a', { role: 'sink', demand: 10 }),
      part('b', { role: 'sink', demand: 10 }, { min: 228 }),
    ],
    [
      { from: 'grid', to: 'pole1', domain: 'electric', capacity: 30, drop: 8 },
      { from: 'pole1', to: 'a', domain: 'electric' },
      { from: 'pole1', to: 'pole2', domain: 'electric', capacity: 30, drop: 8 },
      { from: 'pole2', to: 'b', domain: 'electric' },
    ],
  )
  const sol = run(s)
  // 20 kW over the first span, 10 over the second
  near(sol.parts.pole1!.effort, 240 - 8 * (20 / 30))
  near(sol.parts.b!.effort, 240 - 8 * (20 / 30) - 8 * (10 / 30))
  near(sol.links[2]!.effortFrom, sol.parts.pole1!.effort)
  near(sol.links[2]!.effortTo, sol.parts.pole2!.effort)
})

test('a pipe loses pressure as the square of its flow, and a pump adds its head', () => {
  const s = scene(
    [
      part('tank', {
        role: 'storage',
        capacity: 100,
        start: 1,
        maxIn: 0,
        maxOut: 50,
      }),
      part(
        'pump',
        { role: 'converter', output: 'water', recipe: { water: 1 } },
        { boost: 4 },
      ),
      part(
        'valve',
        { role: 'gate', capacity: 20 },
        { drop: 0.8 }, // bar, wide open at 20 m³/h
      ),
      part('tap', { role: 'sink', demand: 10 }),
    ],
    [
      { from: 'tank', to: 'pump', domain: 'water' },
      { from: 'pump', to: 'valve', domain: 'water', capacity: 20, drop: 1 },
      { from: 'valve', to: 'tap', domain: 'water' },
    ],
  )
  const sol = run(s)
  // the tank sets nothing, so the pump's head is all there is
  near(sol.parts.pump!.effort, 4)
  near(sol.parts.valve!.effortIn, 4 - 1 * (10 / 20) ** 2)
  near(sol.parts.valve!.effort, 4 - 0.25 - 0.8 * (10 / 20) ** 2)
  near(sol.parts.tap!.effort, sol.parts.valve!.effort)
})

test('throttling a valve raises its drop at the same flow', () => {
  const build = (open: number) =>
    scene(
      [
        part('main', { role: 'source', output: 100 }, { set: 6 }),
        part('valve', { role: 'gate', capacity: 20, open }, { drop: 0.5 }),
        part('tap', { role: 'sink', demand: 5 }),
      ],
      [
        { from: 'main', to: 'valve', domain: 'water' },
        { from: 'valve', to: 'tap', domain: 'water' },
      ],
    )
  const wide = run(build(1)).parts.tap!.effort
  const half = run(build(0.5)).parts.tap!.effort
  near(wide, 6 - 0.5 * (5 / 20) ** 2)
  near(half, 6 - 0.5 * (5 / 10) ** 2)
  // shut, nothing gets through and there is no pressure behind the tap
  const shut = run(build(0)).parts.tap!
  assert.equal(shut.in, 0)
  assert.equal(shut.effort, 0)
})

test('a transformer multiplies by its ratio; a regulator caps', () => {
  const s = scene(
    [
      part('grid', { role: 'source', output: 1000 }, { set: 11000 }),
      part(
        'tx',
        { role: 'converter', output: 'electric', recipe: { electric: 1.02 } },
        { ratio: 0.4 / 11 },
      ),
      part('house', { role: 'sink', demand: 40 }),
      part('mains', { role: 'source', output: 100 }, { set: 6 }),
      part('prv', { role: 'gate', capacity: 50 }, { set: 3 }),
      part('shower', { role: 'sink', demand: 1 }),
    ],
    [
      { from: 'grid', to: 'tx', domain: 'electric' },
      { from: 'tx', to: 'house', domain: 'electric' },
      { from: 'mains', to: 'prv', domain: 'water' },
      { from: 'prv', to: 'shower', domain: 'water' },
    ],
  )
  const sol = run(s)
  near(sol.parts.house!.effort, 400)
  near(sol.parts.shower!.effort, 3)
})

test('where nothing flows the highest effort stands; flows mix by how much each brings', () => {
  const s = scene(
    [
      part('hot', { role: 'source', output: 30 }, { set: 80 }),
      part('warm', { role: 'source', output: 10 }, { set: 40 }),
      part('mix', { role: 'bus' }),
      part('room', { role: 'sink', demand: 40 }),
    ],
    [
      { from: 'hot', to: 'mix', domain: 'heat' },
      { from: 'warm', to: 'mix', domain: 'heat' },
      { from: 'mix', to: 'room', domain: 'heat' },
    ],
  )
  near(run(s).parts.room!.effort, (80 * 30 + 40 * 10) / 40)
  const idle = scene(s.parts.slice(0, 3), s.links.slice(0, 2))
  near(run(idle).parts.mix!.effort, 80)
})

test('a supply with nothing to give holds no effort; a sheet without effort reads NaN', () => {
  const s = scene(
    [
      part('pv', { role: 'source', output: 0 }, { set: 400 }),
      part('load', { role: 'sink', demand: 1 }),
    ],
    [{ from: 'pv', to: 'load', domain: 'electric' }],
  )
  assert.equal(run(s).parts.load!.effort, 0)
  const plain = scene(
    [
      part('a', { role: 'source', output: 5 }),
      part('b', { role: 'sink', demand: 1 }),
    ],
    [{ from: 'a', to: 'b', domain: 'water' }],
  )
  assert.ok(Number.isNaN(run(plain).parts.b!.effort))
})

test('a pump against a shut valve lifts the relief valve, which settles', () => {
  // the pump's head falls as it delivers more: 200 bar shut off, 100 at 40 L/min
  const s = scene(
    [
      part('tank', {
        role: 'storage',
        capacity: 1e6,
        start: 0.5,
        maxIn: 1e6,
        maxOut: 1e6,
      }),
      part(
        'pump',
        {
          role: 'converter',
          output: 'oil',
          recipe: { oil: 1 },
          capacity: 40,
        },
        { boost: "200 - 100 * pow(part('pump').out / 40, 2)" },
      ),
      part('p', { role: 'bus' }),
      part('valve', { role: 'gate', capacity: 40, open: 0 }),
      part('ram', { role: 'sink', demand: 30 }),
      part('relief', {
        role: 'gate',
        capacity: 40,
        relief: { at: 150, full: 180 },
      }),
      part('drain', { role: 'sink', demand: 40 }),
    ],
    [
      { from: 'tank', to: 'pump', domain: 'oil' },
      { from: 'pump', to: 'p', domain: 'oil' },
      { from: 'p', to: 'valve', domain: 'oil' },
      { from: 'valve', to: 'ram', domain: 'oil' },
      { from: 'p', to: 'relief', domain: 'oil' },
      { from: 'relief', to: 'drain', domain: 'oil' },
    ],
  )
  const model = compile(s)
  const memory = initialMemory(model)
  let last = 0
  const opens: number[] = []
  for (let i = 0; i < 30; i++) {
    const sol = solve(model, env, 1 / 30, memory)
    opens.push(sol.parts.relief!.open)
    last = sol.parts.p!.effort
  }
  // shut in, the pump would make 200 bar; the relief lifts until what it
  // lets by brings the head down to what holds it there, on the first tick
  assert.ok(opens.at(-1)! > 0.05, `relief open ${opens.at(-1)}`)
  assert.ok(last > 150 && last < 185, `holds at ${last} bar`)
  // settled, not chattering
  const tail = opens.slice(1)
  assert.ok(Math.max(...tail) - Math.min(...tail) < 1e-3, String(tail))
  // and opening the way to the ram lets the pressure off the relief
  const open = structuredClone(s)
  ;(open.parts[3]!.behaviour as { open: number }).open = 1
  const sol = run(open)
  assert.equal(sol.parts.relief!.open, 0)
  assert.equal(sol.parts.ram!.in, 30)
})
