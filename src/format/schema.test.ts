// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { Ajv2020 } from 'ajv/dist/2020.js'

import { SCENES } from '../scenes/index.ts'
import { FORMAT_VERSION, stamp } from './migrate.ts'
import { sceneSchema } from './schema.ts'
import { validateScene } from './validate.ts'

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown

const ajv = new Ajv2020({ allErrors: true, strict: true })
const check = ajv.compile(sceneSchema())

test('the committed schema is up to date (run `npm run schema` if not)', () => {
  assert.deepEqual(
    read(`../../schema/scene.v${FORMAT_VERSION}.json`),
    sceneSchema(),
  )
})

test('every built-in sheet and the example files match the schema', () => {
  for (const s of SCENES) {
    const v = validateScene(stamp(JSON.parse(JSON.stringify(s))))
    assert.ok(check(v.scene), `${s.id}: ${ajv.errorsText(check.errors)}`)
  }
  for (const f of [
    'narrowboat',
    'feed-tank-pid',
    'distillation-pid',
    'hydraulic-press',
  ])
    assert.ok(
      check(read(`../../examples/${f}.json`)),
      `${f}: ${ajv.errorsText(check.errors)}`,
    )
})

test('the schema rejects what the validator warns or errors about', () => {
  const example = read('../../examples/narrowboat.json') as {
    parts: Array<Record<string, unknown>>
  }
  const typo = structuredClone(example)
  typo.parts[0]!.lable = 'x'
  assert.equal(check(typo), false)
  const badRole = structuredClone(example)
  badRole.parts[0]!.behaviour = { role: 'sorce', output: 1 }
  assert.equal(check(badRole), false)
})
