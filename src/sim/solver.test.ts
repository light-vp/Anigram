// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile, initialMemory, solve } from './solver.ts'
import type { Env, Scene } from './types.ts'

const env = (hour = 12): Env => ({
  hour,
  day: 0,
  knob: () => 0,
  on: () => true,
  prev: () => ({ in: 0, out: 0, fill: 0 }),
})

function scene(parts: Scene['parts'], links: Scene['links']): Scene {
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

const at: [number, number] = [0, 0]

test('a bus serves its cheapest input first', () => {
  const s = scene(
    [
      {
        id: 'sun',
        kind: 'x',
        label: 'sun',
        at,
        behaviour: { role: 'source', output: 3 },
      },
      {
        id: 'gas',
        kind: 'x',
        label: 'gas',
        at,
        behaviour: { role: 'source', output: 10, dispatchable: true },
      },
      { id: 'bus', kind: 'x', label: 'bus', at, behaviour: { role: 'bus' } },
      {
        id: 'home',
        kind: 'x',
        label: 'home',
        at,
        behaviour: { role: 'sink', demand: 5 },
      },
    ],
    [
      { from: 'gas', to: 'bus', domain: 'electric' },
      { from: 'sun', to: 'bus', domain: 'electric' },
      { from: 'bus', to: 'home', domain: 'electric' },
    ],
  )
  const m = compile(s)
  const r = solve(m, env(), 0.1, initialMemory(m))
  assert.equal(r.parts.sun!.out, 3)
  assert.equal(r.parts.gas!.out, 2)
  assert.equal(r.parts.home!.in, 5)
})

test('a converter pulls its recipe and vents its losses', () => {
  const s = scene(
    [
      {
        id: 'gas',
        kind: 'x',
        label: 'gas',
        at,
        behaviour: { role: 'source', output: 100, dispatchable: true },
      },
      {
        id: 'plant',
        kind: 'x',
        label: 'plant',
        at,
        behaviour: {
          role: 'converter',
          output: 'electric',
          recipe: { fuel: 2.5 },
        },
      },
      { id: 'sky', kind: 'x', label: 'sky', at, behaviour: { role: 'vent' } },
      {
        id: 'town',
        kind: 'x',
        label: 'town',
        at,
        behaviour: { role: 'sink', demand: 10 },
      },
    ],
    [
      { from: 'gas', to: 'plant', domain: 'fuel' },
      { from: 'plant', to: 'town', domain: 'electric' },
      { from: 'plant', to: 'sky', domain: 'heat', loss: true },
    ],
  )
  const m = compile(s)
  const r = solve(m, env(), 0.1, initialMemory(m))
  assert.equal(r.parts.gas!.out, 25)
  assert.equal(r.parts.town!.in, 10)
  assert.equal(r.parts.plant!.loss, 15)
  assert.equal(r.parts.sky!.in, 15)
})

test('storage charges only from surplus, and covers a shortfall', () => {
  const parts: Scene['parts'] = [
    {
      id: 'sun',
      kind: 'x',
      label: 'sun',
      at,
      behaviour: { role: 'source', output: (e) => (e.hour === 12 ? 8 : 0) },
    },
    {
      id: 'gas',
      kind: 'x',
      label: 'gas',
      at,
      behaviour: { role: 'source', output: 10, dispatchable: true },
    },
    { id: 'bus', kind: 'x', label: 'bus', at, behaviour: { role: 'bus' } },
    {
      id: 'bat',
      kind: 'x',
      label: 'bat',
      at,
      behaviour: {
        role: 'storage',
        capacity: 10,
        start: 0.5,
        maxIn: 2,
        maxOut: 4,
      },
    },
    {
      id: 'home',
      kind: 'x',
      label: 'home',
      at,
      behaviour: { role: 'sink', demand: 5 },
    },
  ]
  const links: Scene['links'] = [
    { from: 'sun', to: 'bus', domain: 'electric' },
    { from: 'gas', to: 'bus', domain: 'electric' },
    { from: 'bat', to: 'bus', domain: 'electric' },
    { from: 'bus', to: 'bat', domain: 'electric' },
    { from: 'bus', to: 'home', domain: 'electric' },
  ]
  const m = compile(scene(parts, links))
  const mem = initialMemory(m)

  // noon: 8 of sun, 5 to the home, 2 into the battery (its max), 1 curtailed
  const noon = solve(m, env(12), 1, mem)
  assert.equal(noon.parts.home!.in, 5)
  assert.equal(noon.parts.gas!.out, 0)
  assert.equal(noon.parts.bat!.in, 2)
  assert.equal(mem.level.get('bat'), 7)

  // night: the battery gives its 4, gas makes up 1 — and nothing charges
  const night = solve(m, env(0), 1, mem)
  assert.equal(night.parts.bat!.out, 4)
  assert.equal(night.parts.gas!.out, 1)
  assert.equal(night.parts.bat!.in, 0)
  assert.equal(mem.level.get('bat'), 3)
})

test('a closed gate cuts everything downstream, and priority wins a shortfall', () => {
  const parts: Scene['parts'] = [
    {
      id: 'gen',
      kind: 'x',
      label: 'gen',
      at,
      behaviour: { role: 'source', output: 6 },
    },
    {
      id: 'brk',
      kind: 'x',
      label: 'brk',
      at,
      behaviour: {
        role: 'gate',
        capacity: 100,
        open: (e) => (e.on('brk') ? 1 : 0),
      },
    },
    { id: 'bus', kind: 'x', label: 'bus', at, behaviour: { role: 'bus' } },
    {
      id: 'hospital',
      kind: 'x',
      label: 'h',
      at,
      behaviour: { role: 'sink', demand: 4, priority: 10 },
    },
    {
      id: 'homes',
      kind: 'x',
      label: 'homes',
      at,
      behaviour: { role: 'sink', demand: 4 },
    },
  ]
  const links: Scene['links'] = [
    { from: 'gen', to: 'brk', domain: 'electric' },
    { from: 'brk', to: 'bus', domain: 'electric' },
    { from: 'bus', to: 'homes', domain: 'electric' },
    { from: 'bus', to: 'hospital', domain: 'electric' },
  ]
  const m = compile(scene(parts, links))
  const on = solve(m, env(), 0.1, initialMemory(m))
  assert.equal(on.parts.hospital!.in, 4)
  assert.equal(on.parts.homes!.in, 2)

  const off = solve(m, { ...env(), on: () => false }, 0.1, initialMemory(m))
  assert.equal(off.parts.hospital!.in, 0)
  assert.equal(off.parts.homes!.in, 0)
})

test('equal-priority sinks share a shortfall', () => {
  const parts: Scene['parts'] = [
    {
      id: 'gen',
      kind: 'x',
      label: 'gen',
      at,
      behaviour: { role: 'source', output: 6 },
    },
    {
      id: 'a',
      kind: 'x',
      label: 'a',
      at,
      behaviour: { role: 'sink', demand: 4 },
    },
    {
      id: 'b',
      kind: 'x',
      label: 'b',
      at,
      behaviour: { role: 'sink', demand: 4 },
    },
  ]
  const links: Scene['links'] = [
    { from: 'gen', to: 'a', domain: 'electric' },
    { from: 'gen', to: 'b', domain: 'electric' },
  ]
  const m = compile(scene(parts, links))
  const r = solve(m, env(), 0.1, initialMemory(m))
  assert.equal(r.parts.a!.in, 3)
  assert.equal(r.parts.b!.in, 3)
})

test('a loop through a store (pumped hydro) charges on surplus and generates on demand', () => {
  const parts: Scene['parts'] = [
    {
      id: 'nuke',
      kind: 'x',
      label: 'n',
      at,
      behaviour: { role: 'source', output: 10 },
    },
    { id: 'bus', kind: 'x', label: 'bus', at, behaviour: { role: 'bus' } },
    {
      id: 'pump',
      kind: 'x',
      label: 'p',
      at,
      behaviour: {
        role: 'converter',
        output: 'water',
        recipe: { electric: 1 },
      },
    },
    {
      id: 'lake',
      kind: 'x',
      label: 'l',
      at,
      behaviour: {
        role: 'storage',
        capacity: 100,
        start: 0.5,
        maxIn: 5,
        maxOut: 5,
      },
    },
    {
      id: 'turb',
      kind: 'x',
      label: 't',
      at,
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { water: 1.25 },
      },
    },
    {
      id: 'city',
      kind: 'x',
      label: 'c',
      at,
      behaviour: { role: 'sink', demand: (e) => (e.hour < 12 ? 6 : 13) },
    },
  ]
  const links: Scene['links'] = [
    { from: 'nuke', to: 'bus', domain: 'electric' },
    { from: 'turb', to: 'bus', domain: 'electric' },
    { from: 'bus', to: 'pump', domain: 'electric' },
    { from: 'pump', to: 'lake', domain: 'water' },
    { from: 'lake', to: 'turb', domain: 'water' },
    { from: 'bus', to: 'city', domain: 'electric' },
  ]
  const m = compile(scene(parts, links))
  const mem = initialMemory(m)
  const night = solve(m, env(3), 1, mem)
  assert.equal(night.parts.city!.in, 6)
  assert.equal(night.parts.pump!.out, 4)
  assert.equal(night.parts.turb!.out, 0)
  const peak = solve(m, env(18), 1, mem)
  assert.equal(peak.parts.city!.in, 13)
  assert.equal(peak.parts.turb!.out, 3)
  assert.equal(peak.parts.pump!.out, 0)
})

test('a slow-starting converter delivers nothing until it has been asked for long enough', () => {
  const parts: Scene['parts'] = [
    {
      id: 'tank',
      kind: 'x',
      label: 't',
      at,
      behaviour: {
        role: 'storage',
        capacity: 1000,
        start: 1,
        maxIn: 0,
        maxOut: 1000,
        merit: 8,
      },
    },
    {
      id: 'gen',
      kind: 'x',
      label: 'g',
      at,
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { fuel: 2 },
        startup: 0.5,
      },
    },
    {
      id: 'ups',
      kind: 'x',
      label: 'u',
      at,
      behaviour: {
        role: 'storage',
        capacity: 100,
        start: 1,
        maxIn: 0,
        maxOut: 100,
      },
    },
    { id: 'bus', kind: 'x', label: 'b', at, behaviour: { role: 'bus' } },
    {
      id: 'load',
      kind: 'x',
      label: 'l',
      at,
      behaviour: { role: 'sink', demand: 10 },
    },
  ]
  const links: Scene['links'] = [
    { from: 'tank', to: 'gen', domain: 'fuel' },
    { from: 'gen', to: 'bus', domain: 'electric' },
    { from: 'ups', to: 'bus', domain: 'electric' },
    { from: 'bus', to: 'load', domain: 'electric' },
  ]
  const m = compile(scene(parts, links))
  const mem = initialMemory(m)
  const first = solve(m, env(), 0.25, mem)
  assert.equal(first.parts.gen!.out, 0)
  assert.equal(first.parts.gen!.starting, true)
  assert.equal(first.parts.ups!.out, 10)
  solve(m, env(), 0.25, mem)
  const warm = solve(m, env(), 0.25, mem)
  assert.equal(warm.parts.gen!.out, 10)
  assert.equal(warm.parts.ups!.out, 0)
})
