// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { checkExpectations, expectLines } from './expect.ts'
import { simulateDay } from './report.ts'
import { validateScene } from './validate.ts'

// a kettle that boils from 6:30 to 8:30 on a 4 kW supply that a knob can turn down
const kettle = (expect: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'kettle',
  title: 'A kettle',
  size: [3, 1],
  units: { electric: { rate: 'kW', amount: 'kWh' } },
  scale: { electric: 3 },
  clock: { start: 0, rate: 1 },
  knobs: [{ id: 'supply', label: 'supply', value: 4, min: 0, max: 10 }],
  parts: [
    {
      id: 'grid',
      kind: 'grid',
      label: 'Grid',
      at: [0, 0],
      behaviour: { role: 'source', output: "knob('supply')" },
    },
    {
      id: 'kettle',
      kind: 'house',
      label: 'Kettle',
      at: [2, 0],
      behaviour: { role: 'sink', demand: 'between(hour, 6.5, 8.5) ? 3 : 0' },
    },
  ],
  links: [{ from: 'grid', to: 'kettle', domain: 'electric' }],
  expect,
  ...extra,
})

function run(raw: unknown, knobs?: Record<string, number>) {
  const v = validateScene(raw)
  assert.ok(v.scene, v.errors.join('\n'))
  return checkExpectations(v.scene, simulateDay(v.scene, { knobs }), { knobs })
}

test('every built-in sheet tells the story its expect list claims', () => {
  for (const s of SCENES) {
    const scene = s as Scene
    assert.ok(scene.expect?.length, `${scene.id} has no expect list`)
    const results = checkExpectations(scene, simulateDay(scene))
    assert.ok(
      results.every((r) => r.ok),
      `${scene.id}:\n${expectLines(results)}`,
    )
  }
})

test('at, from–to and the whole day pick the hours checked', () => {
  const [at, window, wrap, day] = run(
    kettle([
      { says: 'boiling at 8', check: "part('kettle').in > 0", at: 8 },
      {
        says: 'boiling 7 till 8',
        check: "part('kettle').in > 0",
        from: 7,
        to: 8,
      },
      {
        says: 'quiet overnight',
        check: "part('kettle').in == 0",
        from: 22,
        to: 2,
      },
      {
        says: 'never short',
        check: "part('kettle').in >= part('kettle').demand",
      },
    ]),
  )
  assert.deepEqual(at!.hours, [8])
  assert.equal(at!.ok, true)
  assert.deepEqual(window!.hours, [7, 8])
  assert.deepEqual(
    wrap!.hours.sort((a, b) => a - b),
    [0, 1, 2, 22, 23],
  )
  assert.equal(day!.hours.length, 24)
  assert.equal(day!.ok, true)
})

test('a failure says when, and what the parts were doing', () => {
  // 2 kW of supply for a 3 kW kettle
  const [short, sometime] = run(
    kettle([
      {
        says: 'never short',
        check: "part('kettle').in >= part('kettle').demand",
      },
      {
        says: 'gets 3 kW at some point',
        check: "part('kettle').in >= 3",
        sometime: true,
      },
    ]),
    { supply: 2 },
  )
  assert.equal(short!.ok, false)
  assert.deepEqual(short!.failed, [7, 8])
  assert.deepEqual(short!.values, { 'kettle.in': 2, 'kettle.demand': 3 })
  assert.equal(sometime!.ok, false)
  assert.equal(sometime!.failed.length, 24)
  assert.match(
    expectLines([short!]),
    /✗ never short — fails at 07:00, 08:00 \(kettle\.in = 2, kettle\.demand = 3 at 07:00\)/,
  )
  assert.match(expectLines([sometime!]), /never holds/)
})

test('knob() and on() read the controls the day ran with', () => {
  const check = [{ says: 'a strong supply', check: "knob('supply') >= 4" }]
  assert.equal(run(kettle(check))[0]!.ok, true)
  assert.equal(run(kettle(check), { supply: 1 })[0]!.ok, false)
})

test('the validator catches a bad expect list, with suggestions', () => {
  const errs = (expect: unknown[], extra?: Record<string, unknown>) =>
    validateScene(kettle(expect, extra)).errors.join('\n')
  assert.match(
    errs([{ says: 'x', check: "part('kettel').in > 0" }]),
    /part\('kettel'\) — no part has that id — did you mean "kettle"\?/,
  )
  assert.match(
    errs([{ says: 'x', check: "prev('kettle').in > 0" }]),
    /a check reads a part with part\('kettle'\)/,
  )
  assert.match(
    errs([{ says: 'x', check: "part('kettle') > 0" }]),
    /needs a field/,
  )
  assert.match(errs([{ says: 'x', check: '1', at: 7.5 }]), /on the hour/)
  assert.match(errs([{ says: 'x', check: '1', from: 7 }]), /both from and to/)
  assert.match(
    errs([{ says: 'x', check: '1', at: 7, from: 6, to: 8 }]),
    /not both/,
  )
  assert.match(errs([{ check: '1' }]), /expect\[0\]\.says/)
  assert.match(
    validateScene(kettle([{ says: 'x', check: '1', ta: 7 }])).warnings.join(
      '\n',
    ),
    /expect\[0\]\.ta.*did you mean "at"/,
  )
  assert.match(errs({} as unknown as unknown[]), /expect: must be an array/)
})

test('part() is for checks only; a signal still reads parts with prev()', () => {
  const v = validateScene(
    kettle([], {
      parts: [
        {
          id: 'grid',
          kind: 'grid',
          label: 'Grid',
          at: [0, 0],
          behaviour: { role: 'source', output: "part('kettle').demand" },
        },
        {
          id: 'kettle',
          kind: 'house',
          label: 'Kettle',
          at: [2, 0],
          behaviour: { role: 'sink', demand: 3 },
        },
      ],
    }),
  )
  assert.match(
    v.errors.join('\n'),
    /part\('kettle'\) reads a part as it is now, which a flow can't/,
  )
})
