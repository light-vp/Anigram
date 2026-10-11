// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { validateScene } from '../format/validate.ts'
import type { Scene } from '../sim/types.ts'
import { DRAWING_RULES, drawingFindings } from './checks.ts'
import { STARTERS } from './starters.ts'

const load = (raw: unknown) => validateScene(structuredClone(raw)).scene!
const rules = (scene: Scene) => drawingFindings(scene).map((f) => f.rule)
const starter = (d: keyof typeof STARTERS) =>
  structuredClone(STARTERS[d]) as unknown as Scene & Record<string, unknown>

test('every starter and the reference P&ID follow their practice', () => {
  for (const s of Object.values(STARTERS))
    assert.deepEqual(drawingFindings(load(s)), [])
  const feed = JSON.parse(
    readFileSync(
      new URL('../../examples/feed-tank-pid.json', import.meta.url),
      'utf8',
    ),
  )
  assert.deepEqual(drawingFindings(load(feed)), [])
})

test('every finding names a known rule', () => {
  const s = starter('pid')
  s.titleBlock = {}
  delete s.sheet
  for (const p of s.parts) delete p.tag
  for (const l of s.links) delete l.tag
  s.instruments = []
  for (const r of rules(load(s))) assert.ok(r in DRAWING_RULES, r)
})

test('the title block and drawing number are asked for', () => {
  const s = starter('pfd')
  s.titleBlock = { owner: 'Acme' }
  delete s.sheet
  const f = drawingFindings(load(s)).filter((x) => x.rule === 'title-block')
  assert.equal(f.length, 2)
  assert.match(f[0]!.message, /drawn by, issue date, revision, status/)
  assert.match(f[1]!.message, /"PFD-001"/)
})

test('untagged equipment gets the next free tag in its scheme', () => {
  const s = starter('single-line')
  for (const p of s.parts) if (p.id === 'q2' || p.id === 'q3') delete p.tag
  const f = drawingFindings(load(s)).filter((x) => x.rule === 'equipment-tag')
  assert.deepEqual(
    f.map((x) => /"(.*)"/.exec(x.message)![1]),
    ['-Q5', '-Q6'],
  )
  const p = starter('pid')
  p.parts.find((x) => x.id === 'pump')!.tag = undefined
  assert.match(drawingFindings(load(p))[0]!.message, /"P-101"/)
})

test('a tag that names the wrong kind of thing is marked up', () => {
  const s = starter('pid')
  s.parts.find((p) => p.id === 'pump')!.tag = 'T-102'
  s.parts.find((p) => p.id === 'lv')!.tag = 'V-201'
  const f = drawingFindings(load(s))
  assert.deepEqual(
    f.map((x) => x.rule),
    ['tag-letter', 'tag-letter', 'control-loop'],
  )
  const sl = starter('single-line')
  sl.parts.find((p) => p.id === 'tx')!.tag = '-Q9'
  assert.match(drawingFindings(load(sl))[0]!.message, /-T/)
  // ANSI sheets use device numbers, so their letters aren't checked
  sl.symbols = 'ansi'
  assert.deepEqual(drawingFindings(load(sl)), [])
})

test('lines are numbered, once each, and a valve carries its line through', () => {
  const s = starter('pid')
  s.links[2]!.tag = s.links[0]!.tag
  s.links[3]!.tag = 'water pipe'
  const f = drawingFindings(load(s)).filter((x) => x.rule === 'line-number')
  assert.equal(f.length, 2)
  assert.match(f[0]!.message, /also the number/)
  assert.match(f[1]!.message, /size, fluid code and sequence/)
  // the outlet runs through LV-101: one tagged side carries the number
  const t = starter('pid')
  const out = t.links.find((l) => l.from === 'lv')!
  delete out.tag
  assert.deepEqual(rules(load(t)), [])
})

test('a control valve needs a controller, and a loop shares its number', () => {
  const s = starter('pid')
  s.instruments = s.instruments!.filter((x) => !x.drives)
  assert.deepEqual(rules(load(s)), ['control-loop'])
  const t = starter('pid')
  t.instruments!.find((x) => x.drives)!.tag = 'LIC-102'
  const f = drawingFindings(load(t))
  assert.equal(f.length, 2)
  assert.match(f[0]!.message, /LIC-101/)
  assert.match(f[1]!.message, /LV-102|LIC-101/)
})

test('a level is measured on something that holds a level', () => {
  const s = starter('pid')
  s.instruments!.find((x) => x.tag === 'LT-101')!.measures = 'pump'
  assert.ok(rules(load(s)).includes('measured-variable'))
})

test('a generator or load on a busbar needs a breaker', () => {
  const s = starter('single-line')
  s.parts = s.parts.filter((p) => p.id !== 'q4')
  s.links = s.links.filter((l) => l.from !== 'q4' && l.to !== 'q4')
  s.links.push({ from: 'gen', to: 'board', domain: 'electric' })
  const f = drawingFindings(load(s))
  assert.deepEqual(
    f.map((x) => x.rule),
    ['protection'],
  )
  assert.match(f[0]!.message, /-G1 joins -W1 .* "-Q4"/)
})

test('a pictorial sheet has no practice rules', () => {
  assert.deepEqual(drawingFindings(load(STARTERS.pictorial)), [])
})
