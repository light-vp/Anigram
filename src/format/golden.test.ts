// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import { simulateDay } from './report.ts'

/*
 * Golden days: what each built-in sheet does, hour by hour, committed in
 * test/golden/. A change to the solver, a signal or a scene that moves any
 * number fails here, so the sheets' stories can't shift unnoticed. When the
 * change is meant, `npm run golden:update` rewrites the files and the diff
 * goes in the PR for review.
 */

const DIR = new URL('../../test/golden/', import.meta.url)
const UPDATE = process.env.UPDATE_GOLDEN === '1'
/** the report rounds to 3 places; allow one unit of rounding either way */
const TOLERANCE = 1.5e-3

/** every difference between two reports, as `path: expected → actual` */
function diff(expected: unknown, actual: unknown, path = ''): string[] {
  if (typeof expected === 'number' && typeof actual === 'number')
    return Math.abs(expected - actual) <= TOLERANCE
      ? []
      : [`${path}: ${expected} → ${actual}`]
  if (
    typeof expected !== 'object' ||
    typeof actual !== 'object' ||
    expected === null ||
    actual === null
  )
    return expected === actual
      ? []
      : [`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`]
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  return [...keys].flatMap((k) =>
    diff(
      (expected as Record<string, unknown>)[k],
      (actual as Record<string, unknown>)[k],
      path ? `${path}.${k}` : k,
    ),
  )
}

for (const scene of SCENES) {
  test(`golden day: ${scene.id}`, () => {
    const file = new URL(`${scene.id}.json`, DIR)
    const report = simulateDay(scene)
    if (UPDATE || !existsSync(file)) {
      mkdirSync(DIR, { recursive: true })
      writeFileSync(file, `${JSON.stringify(report, null, 1)}\n`)
      if (!UPDATE)
        assert.fail(`wrote missing golden file test/golden/${scene.id}.json`)
      return
    }
    const golden = JSON.parse(readFileSync(file, 'utf8')) as unknown
    const changes = diff(golden, JSON.parse(JSON.stringify(report)))
    assert.deepEqual(
      changes,
      [],
      `${scene.id} no longer runs the day it used to (${changes.length} changes, first: ${changes.slice(0, 5).join('; ')}). ` +
        'If that is intended, run `npm run golden:update` and commit the files.',
    )
  })
}
