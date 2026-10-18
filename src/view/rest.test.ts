// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { frameAt } from '../format/report.ts'
import { validateScene } from '../format/validate.ts'
import { STARTERS } from '../packs/starters.ts'
import type { Scene } from '../sim/types.ts'
import { restFrame } from './rest.ts'

const load = (raw: unknown): Scene => {
  const v = validateScene(structuredClone(raw))
  assert.ok(v.scene, v.errors.join('; '))
  return v.scene
}

test('a P&ID at rest: vessels empty, valves open, every line carrying its arrow, nothing read', () => {
  const scene = load(STARTERS.pid)
  const rest = restFrame(scene, frameAt(scene, 6))
  for (const p of scene.parts) {
    const s = rest.parts[p.id]!
    assert.equal(s.fill, 0, p.id)
    assert.equal(s.activity, 1, p.id)
    if (p.behaviour.role === 'gate') assert.equal(s.open, 1, p.id)
  }
  assert.ok(rest.links.every((l) => l.flow > 0 && l.capacity === Infinity))
  assert.deepEqual(rest.instruments, {})
  assert.deepEqual(rest.alerts, [])
  assert.ok(Object.values(rest.partPhase).every((p) => p === 0))
})

test('a hydraulic circuit at rest: directional valves sit on their springs', () => {
  const scene = load(STARTERS['fluid-power'])
  const rest = restFrame(scene, frameAt(scene, 12))
  const valves = scene.parts.filter((p) =>
    /^DirectionalValve/.test(p.class ?? ''),
  )
  assert.ok(valves.length > 0)
  for (const v of valves) assert.equal(rest.parts[v.id]!.open, 0, v.id)
})
