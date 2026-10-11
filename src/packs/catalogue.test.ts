// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import { validateScene } from '../format/validate.ts'
import type { DrawingType, Scene } from '../sim/types.ts'
import { lineOf, partWay } from '../view/lines.ts'
import { PACKS, classOf, packWarnings, shownParts } from './catalogue.ts'

const as = (s: Scene, drawing: DrawingType): Scene => ({ ...s, drawing })
const byId = (id: string) => SCENES.find((s) => s.id === id) as Scene
const part = (s: Scene, id: string) => s.parts.find((p) => p.id === id)!

test('every kind a pack maps names a class it has', () => {
  for (const pack of Object.values(PACKS))
    for (const [kind, cls] of Object.entries(pack!.fromKind))
      assert.ok(cls in pack!.classes, `${pack!.name}: ${kind} → ${cls}`)
})

test('a P&ID leaves out the power, a single-line everything but', () => {
  const grid = byId('grid')
  const pid = shownParts(as(grid, 'pid'))
  const sld = shownParts(as(grid, 'single-line'))
  // the steelworks only takes power; the reservoir only holds water
  const steel = grid.parts.find((p) => p.kind === 'factory')!.id
  const res = grid.parts.find((p) => p.kind === 'reservoir')!.id
  assert.ok(sld.has(steel) && !pid.has(steel))
  assert.ok(pid.has(res) && !sld.has(res))
})

test('a part is drawn as its class, else its kind, else its role', () => {
  const grid = byId('grid')
  const sld = as(grid, 'single-line')
  const of = (kind: string) =>
    classOf(
      grid.parts.find((p) => p.kind === kind)!,
      sld,
    )
  assert.equal(of('pylon'), 'Cable')
  assert.equal(of('wind'), 'Generator')
  assert.equal(of('city'), 'Load')
  const p = { ...grid.parts.find((p) => p.kind === 'city')! }
  assert.equal(classOf({ ...p, class: 'Motor' }, sld), 'Motor')
  // a class the practice lacks is a box, not a guess
  assert.equal(classOf({ ...p, class: 'Motr' }, sld), undefined)
  // a kind with no symbol falls back on what it does
  assert.equal(classOf({ ...p, kind: 'kettle' }, sld), 'Load')
  assert.equal(
    classOf({ ...p, kind: 'kettle' }, as(grid, 'pid')),
    'OffPageConnector',
  )
  // a pictorial sheet has no classes at all
  assert.equal(classOf(p, grid), undefined)
})

test('a class the practice lacks is a warning with a suggestion', () => {
  const tower = byId('water-tower')
  const s = as(tower, 'pid')
  const pump = s.parts.find((p) => p.kind === 'pump')!
  const w = packWarnings({
    ...s,
    parts: s.parts.map((p) =>
      p === pump ? { ...p, class: 'CentrifugalPmup' } : p,
    ),
  })
  assert.equal(w.length, 1)
  assert.match(w[0]!, /a P&ID has no "CentrifugalPmup"/)
  assert.match(w[0]!, /CentrifugalPump/)
})

test('the built-in sheets draw as P&IDs and single-lines with few boxes', () => {
  // boxes are allowed (a data centre is no P&ID) but these must be clean
  assert.deepEqual(packWarnings(as(byId('water-tower'), 'pid')), [])
  assert.deepEqual(packWarnings(as(byId('hydro-dam'), 'pid')), [])
  assert.deepEqual(packWarnings(as(byId('grid'), 'single-line')), [])
  assert.deepEqual(packWarnings(as(byId('solar-home'), 'single-line')), [])
})

test('lines: data is a signal unless told, and the way a part faces', () => {
  assert.equal(lineOf({ from: 'a', to: 'b', domain: 'data' }), 'signal')
  assert.equal(lineOf({ from: 'a', to: 'b', domain: 'water' }), 'process')
  assert.equal(
    lineOf({ from: 'a', to: 'b', domain: 'water', line: 'utility' }),
    'utility',
  )
  const tower = byId('water-tower')
  const p = part(tower, tower.parts[0]!.id)
  const links = [{ from: 'x', to: p.id, domain: 'water' as const }]
  const down = partWay(p, links, [
    [
      [0, 0],
      [0, 50],
    ],
  ])
  assert.deepEqual(down, { vertical: true, angle: 90 })
  const left = partWay(p, links, [
    [
      [50, 0],
      [0, 0],
    ],
  ])
  assert.deepEqual(left, { vertical: false, angle: 180 })
})

test('drawing, symbols, tags, lines and the title block validate', () => {
  const base = JSON.parse(JSON.stringify(byId('solar-home')))
  const ok = validateScene({
    ...base,
    drawing: 'single-line',
    symbols: 'ansi',
    titleBlock: { owner: 'Anigram', issued: '2026-10-11', revision: 'A' },
    parts: base.parts.map((p: object, i: number) => ({ ...p, tag: `=E${i}` })),
    links: base.links.map((l: object) => ({ ...l, line: 'process' })),
  })
  assert.equal(ok.ok, true, ok.errors.join('\n'))
  assert.equal(ok.scene!.drawing, 'single-line')
  assert.equal(ok.scene!.symbols, 'ansi')
  assert.equal(ok.scene!.titleBlock!.revision, 'A')

  // pictorial is the default, so it isn't stored
  assert.equal(
    validateScene({ ...base, drawing: 'pictorial' }).scene!.drawing,
    undefined,
  )

  const bad = validateScene({
    ...base,
    drawing: 'p&id',
    titleBlock: { issued: '11/10/2026' },
    parts: base.parts.map((p: object) => ({ ...p, tag: 'P-101' })),
    links: base.links.map((l: object) => ({ ...l, line: 'procss' })),
  })
  assert.equal(bad.ok, false)
  const e = bad.errors.join('\n')
  assert.match(e, /unknown drawing type "p&id"/)
  assert.match(e, /titleBlock\.issued: must be a date/)
  assert.match(e, /already has the tag "P-101"/)
  assert.match(e, /unknown line type "procss".*process/)

  const w = validateScene({ ...base, drawing: 'pid', symbols: 'ansi' })
  assert.ok(
    w.warnings.some((x) =>
      x.includes('only a single-line drawing chooses its symbol standard'),
    ),
  )
})
