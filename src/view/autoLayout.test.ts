// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { autoLayout } from './autoLayout.ts'
import { lintLayout } from './lint.ts'

const load = (raw: unknown) => validateScene(structuredClone(raw)).scene!
const feed = JSON.parse(
  readFileSync(
    new URL('../../examples/feed-tank-pid.json', import.meta.url),
    'utf8',
  ),
)
const sld = (id: string) =>
  load({ ...SCENES.find((s) => s.id === id)!, drawing: 'single-line' })

test('every sheet it lays out still loads with no new warnings', () => {
  for (const s of [
    ...SCENES,
    ...Object.values(STARTERS),
    feed,
    { ...SCENES.find((x) => x.id === 'grid')!, drawing: 'single-line' },
  ]) {
    const { scene } = autoLayout(load(s))
    const v = validateScene(structuredClone(scene))
    assert.ok(v.ok, v.errors.join('\n'))
    assert.deepEqual(v.warnings, [], scene.id)
  }
})

test('the engineering sheets come out reading cleanly', () => {
  for (const s of [STARTERS.pid, STARTERS['single-line'], STARTERS.pfd, feed])
    assert.deepEqual(lintLayout(autoLayout(load(s)).scene), [])
  assert.deepEqual(lintLayout(autoLayout(sld('grid')).scene), [])
})

test('only the geometry changes', () => {
  const before = load(STARTERS.pid)
  const { scene } = autoLayout(before)
  const strip = (s: Scene) => ({
    ...s,
    size: 0,
    parts: s.parts.map(({ at: _a, labelSide: _l, ...p }) => p),
    links: s.links.map(({ via: _v, bend: _b, ...l }) => l),
    instruments: s.instruments?.map(({ at: _a, ...x }) => x),
  })
  assert.deepEqual(strip(scene), strip(before))
  assert.deepEqual(autoLayout(before), autoLayout(before))
})

test('a P&ID runs left to right with its instruments above', () => {
  const { scene, direction } = autoLayout(load(feed))
  assert.equal(direction, 'right')
  const at = (id: string) => scene.parts.find((p) => p.id === id)!.at
  assert.ok(at('intake')[0] < at('pump')[0])
  assert.ok(at('pump')[0] < at('tank')[0])
  assert.equal(at('pump')[1], at('tank')[1])
  for (const x of scene.instruments!) assert.ok(x.at[1] < at('tank')[1], x.tag)
})

test('a single-line runs top to bottom, feeders below their busbar', () => {
  const { scene, direction } = autoLayout(load(STARTERS['single-line']))
  assert.equal(direction, 'down')
  const at = (id: string) => scene.parts.find((p) => p.id === id)!.at
  assert.ok(at('supply')[1] < at('board')[1])
  assert.ok(at('q2')[1] > at('board')[1])
  assert.ok(at('process')[1] > at('q2')[1])
  assert.notEqual(at('q2')[0], at('q3')[0])
  assert.equal(autoLayout(load(STARTERS.pid), 'down').direction, 'down')
})
