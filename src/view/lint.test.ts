// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import { SCENES } from '../scenes/index.ts'
import { LAYOUT_RULES, lintLayout } from './lint.ts'

const part = (id: string, at: [number, number]) => ({
  id,
  kind: 'house',
  label: id.toUpperCase(),
  at,
  behaviour: { role: 'bus' },
})
const sheet = (
  parts: ReturnType<typeof part>[],
  links: Array<{ from: string; to: string; via?: [number, number][] }>,
) =>
  validateScene({
    id: 't',
    title: 'T',
    size: [5, 5],
    units: { electric: { rate: 'kW', amount: 'kWh' } },
    parts,
    links: links.map((l) => ({ domain: 'electric', ...l })),
  }).scene!
const rules = (s: ReturnType<typeof sheet>) => lintLayout(s).map((f) => f.rule)

test('the built-in sheets and the starters read cleanly', () => {
  for (const s of [...SCENES, ...Object.values(STARTERS)])
    assert.deepEqual(lintLayout(validateScene(structuredClone(s)).scene!), [])
})

test('two lines that cross are found', () => {
  const s = sheet(
    [
      part('a', [0, 1]),
      part('b', [2, 1]),
      part('c', [1, 0]),
      part('d', [1, 2]),
    ],
    [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ],
  )
  assert.ok(rules(s).includes('crossing'))
})

test('a line through a part, and lines on top of each other', () => {
  const s = sheet(
    [
      part('a', [0, 0]),
      part('b', [2, 0]),
      part('m', [1, 0]),
      part('c', [0, 2]),
      part('d', [3, 2]),
      part('e', [1, 3]),
      part('f', [2, 3]),
    ],
    [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
      {
        from: 'e',
        to: 'f',
        via: [
          [1, 2],
          [2, 2],
        ],
      },
    ],
  )
  const f = lintLayout(s)
  assert.ok(
    f.some((x) => x.rule === 'through-part' && /through m/.test(x.message)),
  )
  assert.ok(f.some((x) => x.rule === 'overlap'))
})

test('a slanted run and a label on a part', () => {
  const s = sheet(
    [
      part('a', [0, 0]),
      part('b', [2, 1]),
      part('c', [3, 3]),
      part('d', [3, 3.3]),
    ],
    [{ from: 'a', to: 'b', via: [[1, 0.5]] }],
  )
  const r = rules(s)
  assert.ok(r.includes('slanted'))
  assert.ok(r.includes('label-collision'))
  for (const x of r) assert.ok(x in LAYOUT_RULES)
})
