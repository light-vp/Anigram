// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import { FORMAT_VERSION, stamp } from './migrate.ts'
import { simulateDay } from './report.ts'
import { decodeScene, encodeScene } from './share.ts'
import { validateScene } from './validate.ts'

const minimal = {
  id: 'kettle',
  title: 'A kettle',
  size: [3, 1],
  units: { electric: { rate: 'kW', amount: 'kWh' } },
  scale: { electric: 3 },
  parts: [
    {
      id: 'grid',
      kind: 'grid',
      label: 'Grid',
      at: [0, 0],
      behaviour: { role: 'source', output: 10 },
    },
    {
      id: 'kettle',
      kind: 'house',
      label: 'Kettle',
      at: [2, 0],
      behaviour: { role: 'sink', demand: 'between(hour, 7, 8) ? 3 : 0' },
    },
  ],
  links: [{ from: 'grid', to: 'kettle', domain: 'electric' }],
}

test('every built-in sheet is a valid scene file, with nothing to warn about', () => {
  for (const s of SCENES) {
    const v = validateScene(JSON.parse(JSON.stringify(s)))
    assert.deepEqual(v.errors, [], s.id)
    assert.deepEqual(v.warnings, [], s.id)
  }
})

test('a short hand-written file gets its defaults filled in', () => {
  const v = validateScene(minimal)
  assert.equal(v.ok, true, v.errors.join('\n'))
  assert.equal(v.scene!.clock.start, 6)
  assert.equal(v.scene!.subtitle, '')
})

test('mistakes are reported against the part they belong to', () => {
  const v = validateScene({
    ...minimal,
    parts: [
      minimal.parts[0],
      {
        ...minimal.parts[1],
        behaviour: { role: 'sink', demand: "knob('kettles')" },
      },
    ],
    links: [
      ...minimal.links,
      { from: 'grid', to: 'toaster', domain: 'electric' },
    ],
  })
  assert.equal(v.ok, false)
  assert.ok(
    v.errors.some(
      (e) => e.includes('(kettle)') && e.includes("knob('kettles')"),
    ),
  )
  assert.ok(v.errors.some((e) => e.includes('toaster')))
})

test('a day report adds up what flowed', () => {
  const v = validateScene(minimal)
  const r = simulateDay(v.scene!)
  assert.equal(r.rows.length, 25)
  // one kettle-hour at 3 kW
  assert.ok(
    Math.abs(r.totals.kettle!.in - 3) < 0.15,
    String(r.totals.kettle!.in),
  )
})

test('a scene survives the trip through a share link', async () => {
  for (const s of SCENES) {
    const json = JSON.parse(JSON.stringify(s))
    assert.deepEqual(await decodeScene(await encodeScene(json)), json)
  }
})

test('a file without a format version is read as version 1, and comes back stamped', () => {
  const v = validateScene(minimal)
  assert.equal(v.scene!.anigram, FORMAT_VERSION)
  assert.equal(Object.keys(v.scene!)[0], 'anigram')
})

test('a file from a newer Anigram is refused with a message that says so', () => {
  const v = validateScene({ ...minimal, anigram: FORMAT_VERSION + 1 })
  assert.equal(v.ok, false)
  assert.match(v.errors[0]!, /newer Anigram/)
  for (const bad of [0, 1.5, '1', null]) {
    const w = validateScene({ ...minimal, anigram: bad })
    assert.equal(w.ok, false, String(bad))
    assert.match(w.errors[0]!, /^anigram: /)
  }
})

test('a share link made before versioning still opens', async () => {
  // a link made before versioning carries no `anigram` field
  const legacy = await encodeScene(minimal)
  const v = validateScene(await decodeScene(legacy))
  assert.equal(v.ok, true, v.errors.join('\n'))
  assert.equal(v.scene!.anigram, FORMAT_VERSION)
})

test('stamp puts the version first and overrides a stale one', () => {
  const s = stamp({ id: 'x', anigram: 0 })
  assert.deepEqual(Object.keys(s), ['anigram', 'id'])
  assert.equal(s.anigram, FORMAT_VERSION)
})

test('the docs and the example file are written in the current format version', () => {
  const doc = readFileSync(
    new URL('../../docs/scene-format.md', import.meta.url),
    'utf8',
  )
  assert.match(doc, new RegExp(`"anigram": ${FORMAT_VERSION},`))
  const example = JSON.parse(
    readFileSync(
      new URL('../../examples/narrowboat.json', import.meta.url),
      'utf8',
    ),
  )
  assert.equal(example.anigram, FORMAT_VERSION)
  assert.equal(validateScene(example).ok, true)
})
