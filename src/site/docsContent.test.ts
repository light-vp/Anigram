// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkExpectations } from '../format/expect.ts'
import { simulateDay } from '../format/report.ts'
import { validateScene } from '../format/validate.ts'
import { SECTIONS } from './docsContent.ts'

test("the docs' example scene file loads and its story holds", () => {
  const code = SECTIONS.find((s) => s.id === 'scene')!.blocks.find(
    (b): b is { code: string } => 'code' in b,
  )!.code
  const v = validateScene(JSON.parse(code))
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.warnings, [])
  const r = checkExpectations(v.scene!, simulateDay(v.scene!))
  assert.ok(
    r.every((x) => x.ok),
    JSON.stringify(r),
  )
})

test('section ids are unique, for the links into them', () => {
  const ids = SECTIONS.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})
