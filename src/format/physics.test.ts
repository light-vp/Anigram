// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { physicsWarnings } from './physics.ts'
import { validateScene } from './validate.ts'

const KW = { rate: 'kW', amount: 'kWh' }

// a scene from parts and links, with every domain in kW unless told otherwise
function sheet(
  parts: Array<[string, string, Record<string, unknown>]>,
  links: Array<[string, string, string, Record<string, unknown>?]>,
  units: Record<string, unknown> = {
    electric: KW,
    fuel: KW,
    heat: KW,
    water: { rate: 'L/s', amount: 'L' },
  },
) {
  return {
    id: 'test',
    title: 'Test',
    size: [8, 4],
    units,
    scale: {},
    clock: { start: 0, rate: 1 },
    parts: parts.map(([id, kind, behaviour], i) => ({
      id,
      kind,
      label: id,
      at: [i, 0],
      behaviour,
    })),
    links: links.map(([from, to, domain, extra]) => ({
      from,
      to,
      domain,
      ...extra,
    })),
  }
}

function warnings(raw: unknown): string[] {
  const v = validateScene(raw)
  assert.ok(v.scene, v.errors.join('\n'))
  return physicsWarnings(v.scene)
}

const source = (output: number | string) => ({ role: 'source', output })
const sink = (demand: number) => ({ role: 'sink', demand })
const converter = (output: string, recipe: Record<string, number>) => ({
  role: 'converter',
  output,
  recipe,
})

test('the built-in sheets are physically sound', () => {
  for (const s of SCENES)
    assert.deepEqual(physicsWarnings(s as Scene), [], (s as Scene).id)
})

test('a machine made into a source is caught: a pump that runs on nothing', () => {
  const w = warnings(
    sheet(
      [
        ['grid', 'grid', source(5)],
        ['pump', 'pump', source(3)],
        ['tank', 'house', sink(3)],
      ],
      [
        ['grid', 'pump', 'electric'],
        ['pump', 'tank', 'water'],
      ],
    ),
  )
  assert.equal(w.length, 1)
  assert.match(
    w[0]!,
    /parts \(pump\): a pump is a source here, so it makes its output from nothing/,
  )
  assert.match(w[0]!, /"recipe": \{ "water": 1, "electric": 0\.2 \}/)
})

test('a source with something linked into it ignores it', () => {
  const [w] = warnings(
    sheet(
      [
        ['tank', 'fueltank', source(5)],
        ['boiler', 'house', source(3)],
        ['home', 'radiator', sink(3)],
      ],
      [
        ['tank', 'boiler', 'fuel'],
        ['boiler', 'home', 'heat'],
      ],
    ),
  )
  assert.match(
    w!,
    /parts \(boiler\): a source ignores what comes in, so the fuel from tank never runs it/,
  )
})

test('a sink that passes something on, and a converter fed what it never uses', () => {
  const w = warnings(
    sheet(
      [
        ['grid', 'grid', source(5)],
        ['tank', 'fueltank', source(5)],
        ['house', 'house', sink(2)],
        ['gen', 'generator', converter('electric', { fuel: 2.5 })],
        ['town', 'city', sink(1)],
      ],
      [
        ['grid', 'house', 'electric'],
        ['house', 'town', 'electric'],
        ['tank', 'gen', 'fuel'],
        ['grid', 'gen', 'electric'],
        ['gen', 'town', 'electric'],
      ],
    ),
  ).join('\n')
  assert.match(
    w,
    /parts \(house\): a sink only consumes, so its electric link to town never carries anything/,
  )
  assert.match(
    w,
    /parts \(gen\): its recipe has no electric, so the electric from grid is never drawn/,
  )
})

test('a converter over 100% efficient, with the right fix for a heat pump', () => {
  const w = warnings(
    sheet(
      [
        ['tank', 'fueltank', source(9)],
        ['gen', 'generator', converter('electric', { fuel: 0.8 })],
        ['grid', 'grid', source(5)],
        ['hp', 'heatpump', converter('heat', { electric: 0.3 })],
        ['home', 'house', sink(1)],
        ['rad', 'radiator', sink(1)],
      ],
      [
        ['tank', 'gen', 'fuel'],
        ['gen', 'home', 'electric'],
        ['grid', 'hp', 'electric'],
        ['hp', 'rad', 'heat'],
      ],
    ),
  )
  assert.equal(w.length, 2)
  assert.match(
    w[0]!,
    /parts \(gen\): turns 0\.8 of energy into 1 of electric: 125% efficient/,
  )
  assert.match(
    w[0]!,
    /"recipe": \{ "fuel": 2\.5 \} for a 40%-efficient generator/,
  )
  assert.match(w[1]!, /parts \(hp\): .*333% efficient/)
  assert.match(w[1]!, /"recipe": \{ "electric": 0\.3, "heat": 0\.7 \}/)
})

test('a heat pump that draws ambient heat is fine', () => {
  const w = warnings(
    sheet(
      [
        ['grid', 'grid', source(5)],
        ['air', 'air', source(5)],
        ['hp', 'heatpump', converter('heat', { electric: 0.3, heat: 0.7 })],
        ['rad', 'radiator', sink(1)],
      ],
      [
        ['grid', 'hp', 'electric'],
        ['air', 'hp', 'heat'],
        ['hp', 'rad', 'heat'],
      ],
    ),
  )
  assert.deepEqual(w, [])
})

test('a round trip that comes back bigger is caught whatever the units', () => {
  // 1.4 MW makes a tonne an hour of hydrogen, and half a tonne makes 1 MW back
  const raw = sheet(
    [
      ['grid', 'grid', source(5)],
      ['elec', 'pump', converter('fuel', { electric: 1.4 })],
      [
        'h2',
        'fueltank',
        { role: 'storage', capacity: 10, maxIn: 5, maxOut: 5 },
      ],
      ['cell', 'generator', converter('electric', { fuel: 0.5 })],
      ['town', 'city', sink(1)],
    ],
    [
      ['grid', 'elec', 'electric'],
      ['elec', 'h2', 'fuel'],
      ['h2', 'cell', 'fuel'],
      ['cell', 'town', 'electric'],
    ],
    {
      electric: { rate: 'MW', amount: 'MWh' },
      fuel: { rate: 't/h', amount: 't' },
    },
  )
  const w = warnings(raw)
  assert.equal(w.length, 1)
  assert.match(
    w[0]!,
    /parts \(elec, cell\): 1 electric sent round through elec and cell comes back as 1\.43/,
  )

  // with believable numbers (50 MWh a tonne in, 16.5 MWh a tonne out) it is quiet
  raw.parts[1]!.behaviour = converter('fuel', { electric: 50 })
  raw.parts[3]!.behaviour = converter('electric', { fuel: 0.06 })
  assert.deepEqual(warnings(raw), [])
})

test('a junction or store that changes one domain into another', () => {
  const [w] = warnings(
    sheet(
      [
        ['tank', 'fueltank', source(5)],
        ['bus', 'busbar', { role: 'bus' }],
        ['home', 'house', sink(1)],
      ],
      [
        ['tank', 'bus', 'fuel'],
        ['bus', 'home', 'electric'],
      ],
    ),
  )
  assert.match(
    w!,
    /parts \(bus\): a bus passes flow on unchanged, but its links carry fuel and electric/,
  )
})

test('physics warnings reach validate_scene, and only once the scene is valid', () => {
  const raw = sheet(
    [
      ['grid', 'grid', source(5)],
      ['pump', 'pump', source(3)],
      ['tank', 'house', sink(3)],
    ],
    [
      ['grid', 'pump', 'electric'],
      ['pump', 'tank', 'water'],
    ],
  )
  assert.ok(
    validateScene(raw).warnings.some((w) =>
      w.includes('a pump is a source here'),
    ),
  )
  const broken = { ...raw, title: undefined, size: 'big' }
  const v = validateScene(broken)
  assert.equal(v.ok, false)
  assert.ok(!v.warnings.some((w) => w.includes('a pump is a source here')))
})
