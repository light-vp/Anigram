// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import { cellToPx, linkPoints } from './geometry.ts'
import { BUSBAR_HALF, busbarSpans, tapBusbars } from './lines.ts'

const scene = validateScene(structuredClone(STARTERS['single-line'])).scene!
const geometry = scene.links.map((l) =>
  tapBusbars(scene, l, linkPoints(scene, l, false)),
)
const at = (from: string, to: string) =>
  geometry[scene.links.findIndex((l) => l.from === from && l.to === to)]!

test('a feeder on another row drops straight from the busbar', () => {
  const [bx, by] = cellToPx(scene.parts.find((p) => p.id === 'board')!.at)
  const [fx, fy] = cellToPx(scene.parts.find((p) => p.id === 'q2')!.at)
  assert.deepEqual(at('board', 'q2'), [
    [fx, by],
    [fx, fy],
  ])
  assert.notEqual(fx, bx)
})

test('a link along the busbar row joins it unchanged', () => {
  const l = scene.links.find((l) => l.from === 'q1' && l.to === 'board')!
  assert.deepEqual(at('q1', 'board'), linkPoints(scene, l, false))
})

test('a busbar reaches past every tap', () => {
  const [bx] = cellToPx(scene.parts.find((p) => p.id === 'board')!.at)
  const [lo, hi] = busbarSpans(scene, scene.links, geometry).get('board')!
  assert.ok(lo <= -BUSBAR_HALF && hi >= BUSBAR_HALF)
  scene.links.forEach((l, i) => {
    const pts = geometry[i]!
    const end =
      l.from === 'board' ? pts[0] : l.to === 'board' ? pts.at(-1) : undefined
    if (end) assert.ok(end[0] - bx > lo && end[0] - bx < hi, l.to)
  })
})
