// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { simulateDay } from '../format/report.ts'
import { validateScene } from '../format/validate.ts'
import { read } from '../sim/solver.ts'
import type { Signal } from '../sim/types.ts'
import { decodeSheet, fromBuildSpec, sanitize } from './legacy.ts'
import type { BuildSpec } from './legacy.ts'
import { TEMPLATES, makePart } from './templates.ts'
import type { ProfileId } from './templates.ts'

/*
 * legacy.fixture.json was recorded from the old playground (BuildSpec and
 * its function-valued presets) just before it was retired: every preset's
 * signals over two days, and each starter sheet's routes and simulated day.
 * The templates and the migration have to reproduce it.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./legacy.fixture.json', import.meta.url), 'utf8'),
) as {
  signals: Record<string, Record<string, number[] | string[]>>
  starters: Record<
    string,
    {
      spec: BuildSpec
      links: unknown[]
      switches: unknown[]
      units: Record<string, unknown>
      scale: Record<string, number>
      rows: Array<Record<string, Record<string, number>>>
    }
  >
}

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b))

test('every template behaves exactly as its old preset did', () => {
  let checked = 0
  for (const [key, want] of Object.entries(fixture.signals)) {
    const [kind, profile, on] = key.split('|')
    const t = TEMPLATES.get(kind!)
    assert.ok(t, `no template for ${kind}`)
    const { part, switch: sw } = makePart(t, {
      id: 'x',
      at: [0, 0],
      size: t.size ? t.size.value * 1.5 : undefined,
      profile: (profile || undefined) as ProfileId | undefined,
      on: on === '' ? undefined : on === 'true',
    })
    const b = part.behaviour as unknown as Record<string, Signal>
    for (const [field, values] of Object.entries(want)) {
      if (field === 'rest') {
        const rest = { ...b } as Record<string, unknown>
        for (const f of ['output', 'demand', 'open', 'maxIn', 'maxOut'])
          delete rest[f]
        assert.deepEqual(rest, JSON.parse(values[0] as string), key)
        continue
      }
      // a converter's output is the domain it makes, not a signal
      if (typeof values[0] === 'string') {
        assert.equal(b[field], values[0], `${key}.${field}`)
        continue
      }
      // every signal is data now: a number or an expression
      assert.ok(typeof b[field] !== 'function', `${key}.${field}`)
      let i = 0
      for (const day of [0, 1])
        for (let h = 0; h < 24; h += 0.5) {
          const env = {
            hour: h,
            day,
            knob: () => 0,
            on: () => sw?.on ?? false,
            prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
          }
          const got = read(b[field]!, env)
          const exp = (values as number[])[i++]!
          assert.ok(
            close(got, exp),
            `${key}.${field} at day ${day} ${h}h: ${got} vs ${exp}`,
          )
          checked++
        }
    }
  }
  assert.ok(checked > 1000)
})

test('a saved playground sheet opens as the same running scene', () => {
  for (const [id, want] of Object.entries(fixture.starters)) {
    const doc = fromBuildSpec(sanitize(want.spec)!)
    const v = validateScene(doc)
    assert.deepEqual(v.errors, [], id)
    // the same lines, in the same places
    assert.deepEqual(JSON.parse(JSON.stringify(doc.links)), want.links, id)
    assert.deepEqual(doc.switches ?? [], want.switches, id)
    for (const d of Object.keys(doc.units!)) {
      assert.deepEqual(doc.units![d as 'water'], want.units[d], id)
      assert.equal(doc.scale![d as 'water'], want.scale[d], id)
    }
    // and the same day, hour by hour
    const rows = simulateDay(v.scene!).rows
    assert.equal(rows.length, want.rows.length)
    rows.forEach((r, h) => {
      for (const [part, s] of Object.entries(want.rows[h]!))
        for (const [k, x] of Object.entries(s))
          assert.ok(
            close(r.parts[part]![k as 'in']!, x),
            `${id} ${part}.${k} at row ${h}: ${r.parts[part]![k as 'in']} vs ${x}`,
          )
    })
  }
})

test('an old #sheet= link still decodes', () => {
  const spec = fixture.starters.solar!.spec
  const bytes = new TextEncoder().encode(JSON.stringify(spec))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const text = btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const back = decodeSheet(text)
  assert.ok(back)
  assert.equal(back.parts.length, spec.parts.length)
  assert.equal(decodeSheet('not base64 at all!'), null)
})

test('sanitize keeps only real parts and links, with valid ids', () => {
  const spec = sanitize({
    title: 'x',
    parts: [
      { id: 'Sun One', kind: 'sun', at: [0, 0] },
      { id: 'pv', kind: 'pv', at: [1, 0] },
      { id: 'dup', kind: 'pv', at: [1, 0] },
      { id: 'ghost', kind: 'nope', at: [2, 0] },
      { id: 'far', kind: 'house', at: [40, 0] },
    ],
    links: [
      { from: 'Sun One', to: 'pv', domain: 'light' },
      { from: 'pv', to: 'sun-one', domain: 'electric' },
    ],
  })!
  assert.deepEqual(
    spec.parts.map((p) => p.id),
    ['sun-one', 'pv'],
  )
  assert.equal(spec.links.length, 1)
  assert.equal(validateScene(fromBuildSpec(spec)).errors.length, 0)
})
