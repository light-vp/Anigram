// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkExpectations } from '../format/expect.ts'
import { simulateDay } from '../format/report.ts'
import { validateScene } from '../format/validate.ts'
import { PRACTICE, STARTERS } from './starters.ts'

for (const [drawing, starter] of Object.entries(STARTERS))
  test(`the ${drawing} starter is clean and its story holds`, () => {
    const v = validateScene(structuredClone(starter))
    assert.ok(v.ok, v.errors.join('\n'))
    assert.deepEqual(v.warnings, [])
    assert.equal(
      v.scene!.drawing,
      drawing === 'pictorial' ? undefined : drawing,
    )
    const results = checkExpectations(v.scene!, simulateDay(v.scene!))
    assert.ok(results.length >= 2)
    for (const r of results) assert.ok(r.ok, `${r.says}: failed at ${r.failed}`)
    assert.ok(PRACTICE[drawing as keyof typeof PRACTICE].length > 100)
  })

test('the press cylinder strokes out and back through the day', () => {
  const v = validateScene(structuredClone(STARTERS['fluid-power']))
  const fills = simulateDay(v.scene!).rows.map((r) => r.parts.cylinder!.fill!)
  // fully out, then fully home, more than once
  assert.ok(fills.filter((f) => f > 0.95).length >= 3, fills.join(' '))
  assert.ok(fills.filter((f) => f < 0.05).length >= 3, fills.join(' '))
})
