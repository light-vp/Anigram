// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { validateScene } from '../format/validate.ts'
import {
  defaultReading,
  describeTag,
  isIsaTag,
  measuredPart,
  splitTag,
} from './instruments.ts'
import { Simulation } from './runtime.ts'

const example = () =>
  JSON.parse(
    readFileSync(
      new URL('../../examples/feed-tank-pid.json', import.meta.url),
      'utf8',
    ),
  )

test('a tag splits into what it does and its loop, and reads in words', () => {
  assert.deepEqual(splitTag('LIC-101'), { letters: 'LIC', loop: '101' })
  assert.deepEqual(splitTag('FT102'), { letters: 'FT', loop: '102' })
  assert.equal(describeTag('LIC-101'), 'level: indicate, control')
  assert.equal(describeTag('PT-7'), 'pressure: transmit')
  assert.ok(isIsaTag('TIC-201A'))
  assert.ok(!isIsaTag('level sensor'))
  assert.ok(!isIsaTag('101-LT'))
})

test('the reference P&ID validates clean, and its loop reads the tank live', () => {
  const v = validateScene(example())
  assert.ok(v.ok, v.errors.join('\n'))
  assert.deepEqual(v.warnings, [])
  const scene = v.scene!
  const lic = scene.instruments!.find((i) => i.tag === 'LIC-101')!
  // the controller takes its signal from the transmitter, which is on the tank
  assert.equal(measuredPart(lic, scene)?.id, 'tank')
  assert.equal(defaultReading(lic, scene)?.unit, '%')
  const fi = scene.instruments!.find((i) => i.tag === 'FI-102')!
  assert.deepEqual(defaultReading(fi, scene), {
    reads: "part('lv').in",
    unit: 'm³/h',
  })

  const sim = new Simulation(scene)
  sim.tick(0.1)
  const f = sim.frame
  const fill = f.parts.tank!.fill * 100
  assert.ok(Math.abs(f.instruments['LT-101']! - fill) < 1e-9)
  assert.ok(Math.abs(f.instruments['LIC-101']! - fill) < 1e-9)
  assert.ok(Math.abs(f.instruments['FI-102']! - f.parts.lv!.in) < 1e-9)
})

test('an instrument with an explicit reading uses it', () => {
  const raw = example()
  raw.instruments.push({
    tag: 'JI-103',
    at: [2, 0],
    measures: 'pump',
    reads: "part('pump').in * 0.25",
    unit: 'kW',
  })
  const sim = new Simulation(validateScene(raw).scene!)
  sim.tick(0.1)
  assert.ok(sim.frame.instruments['JI-103']! >= 0)
  // a pressure gauge with no reading given reads nothing, but still draws
  raw.instruments.push({ tag: 'PI-104', at: [3, 0], measures: 'pump' })
  const v = validateScene(raw)
  assert.ok(v.ok)
  assert.equal(new Simulation(v.scene!).frame.instruments['PI-104'], undefined)
})

test('instruments are checked against the parts they are wired to', () => {
  const raw = example()
  raw.instruments = [
    { tag: 'LT-1', at: [1, 0], measures: 'tnak' },
    { tag: 'P-101', at: [2, 0], measures: 'pump' },
    { tag: 'LT-2', at: [3, 0], measures: 'tank', mounting: 'console' },
    { tag: 'FT-3', at: [4, 0], measures: 'pump', low: 5, high: 2 },
    { tag: 'TT-4', at: [5, 0], measures: 'pump', reads: "part('pmp').in" },
    { tag: 'LT-5', at: [6, 0], measures: 'LT-5' },
  ]
  const e = validateScene(raw).errors.join('\n')
  assert.match(
    e,
    /instruments\[0\] \(LT-1\)\.measures: no part or instrument is "tnak".*tank/,
  )
  assert.match(e, /pump already has the tag "P-101"/)
  assert.match(e, /mounting: must be field, panel, behind-panel, dcs, plc/)
  assert.match(e, /low must be below high/)
  assert.match(e, /part\('pmp'\) — no part has that id/)
  assert.match(e, /cannot measure itself/)
})

test('a controller with nothing to drive, or driving what is not a valve, is warned', () => {
  const raw = example()
  raw.instruments = [
    { tag: 'LIC-1', at: [5, 0], measures: 'tank' },
    { tag: 'FIC-2', at: [6, 0], measures: 'pump', drives: 'pump' },
    { tag: 'LI-3', at: [7, 0], measures: 'pump' },
    { tag: 'level gauge', at: [8, 0], measures: 'tank' },
  ]
  const w = validateScene(raw).warnings.join('\n')
  assert.match(w, /LIC-1 is a controller, so it should drive something/)
  assert.match(w, /drives: pump is a converter; a controller drives a gate/)
  assert.match(
    w,
    /a level instrument reads a store's fill, but pump is a converter/,
  )
  assert.match(w, /an ISA-5\.1 tag is letters then a loop number/)

  // and on any sheet but a P&ID, nobody sees them
  const flat = validateScene({ ...example(), drawing: 'single-line' })
  assert.ok(
    flat.warnings.some((x) =>
      x.includes('instruments are drawn only on a P&ID'),
    ),
  )
})
