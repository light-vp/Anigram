// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { drawingFindings } from '../packs/checks.ts'
import { simulateDay } from '../format/report.ts'
import { validateScene } from '../format/validate.ts'
import {
  connect,
  movePart,
  patchBehaviour,
  patchLink,
  patchPart,
  removeInstrument,
  removeLink,
  removePart,
  renamePart,
} from './doc.ts'
import type { Doc } from './doc.ts'
import * as history from './history.ts'
import { STARTERS, accept, blank, fileOf, initialDoc } from './open.ts'
import { findItem, place, placeInstrument } from './practice.ts'
import { checkSignal } from './signal.ts'
import { PROFILES, dialOf, profileOf } from './templates.ts'

const example = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8'),
  ) as Doc

/** the JSON paths at which two files differ */
function diff(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return [path || '(root)']
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((k) =>
    diff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      `${path}.${k}`,
    ),
  )
}

const runs = (doc: Doc) => {
  const v = validateScene(doc)
  assert.deepEqual(v.errors, [])
  return v.scene!
}

test('a file an assistant wrote comes back with only the edit changed', () => {
  for (const name of ['feed-tank-pid.json', 'narrowboat.json']) {
    const file = example(name)
    const opened = accept(structuredClone(file))
    assert.ok(opened.doc, name)
    const tank = opened.doc.parts[1]!
    // the person nudges one part's label and its size
    let doc = patchPart(opened.doc, tank.id, { label: 'Renamed' })
    doc = patchPart(doc, tank.id, { labelSide: 'right' })
    const saved = JSON.parse(JSON.stringify(fileOf(doc)))
    assert.deepEqual(diff(file, saved).sort(), [
      `.parts.1.label`,
      `.parts.1.labelSide`,
    ])
    // key order survives too, so a diff of the file is just those lines
    assert.deepEqual(Object.keys(saved), Object.keys(file))
    assert.deepEqual(
      Object.keys(saved.parts[1]).slice(0, 3),
      Object.keys(file.parts[1]!).slice(0, 3),
    )
  }
})

test('moving a part reroutes only its own links', () => {
  const file = example('feed-tank-pid.json')
  const id = file.parts[2]!.id
  const doc = movePart(file, id, [
    file.parts[2]!.at[0],
    file.parts[2]!.at[1] + 1,
  ])
  const changed = diff(file, doc)
  for (const p of changed)
    assert.ok(
      p.startsWith('.parts.2.at') || /^\.links\.\d+\.(via|bend)/.test(p),
      `unexpected change at ${p}`,
    )
  file.links.forEach((l, i) => {
    if (l.from !== id && l.to !== id)
      assert.deepEqual(doc.links[i], l, `links[${i}] should not move`)
  })
})

test('every starter opens, runs and validates', () => {
  for (const s of STARTERS) {
    const doc = s.doc()
    // an empty sheet is a valid start but not yet a scene
    if (!doc.parts.length) continue
    const v = validateScene(doc)
    assert.deepEqual(v.errors, [], s.id)
    simulateDay(v.scene!)
    // each call is a fresh copy, so editing one never touches the menu
    assert.notEqual(s.doc(), s.doc())
  }
})

test('connect infers the flow, adds the return line for a store, and sets units', () => {
  let doc = blank()
  doc = (place(blank(), findItem(undefined, 'busbar')!, [2, 1]) as { doc: Doc })
    .doc
  doc = (place(doc, findItem(undefined, 'battery')!, [2, 3]) as { doc: Doc })
    .doc
  doc = (place(doc, findItem(undefined, 'house')!, [4, 1]) as { doc: Doc }).doc
  doc = (place(doc, findItem(undefined, 'wind')!, [0, 1]) as { doc: Doc }).doc
  for (const [a, b] of [
    ['wind', 'busbar'],
    ['busbar', 'battery'],
    ['busbar', 'house'],
  ] as const) {
    const r = connect(doc, a, b)
    assert.ok('doc' in r, JSON.stringify(r))
    doc = r.doc
  }
  assert.equal(doc.links.length, 4, 'busbar ⇄ battery is two links')
  assert.ok(doc.links.some((l) => l.from === 'battery' && l.to === 'busbar'))
  assert.deepEqual(doc.units?.electric, { rate: 'kW', amount: 'kWh' })
  assert.ok((doc.scale?.electric ?? 0) >= 5)
  const scene = runs(doc)
  simulateDay(scene)

  const bad = connect(doc, 'house', 'wind')
  assert.ok('error' in bad && /Nothing can flow/.test(bad.error))
  assert.ok('error' in connect(doc, 'wind', 'busbar'))
})

test('removing a part takes its links, its switch and its instruments with it', () => {
  const file = example('feed-tank-pid.json')
  const tank = file.parts.find((p) => p.behaviour.role === 'storage')!
  const doc = removePart(file, tank.id)
  assert.ok(!doc.links.some((l) => l.from === tank.id || l.to === tank.id))
  // an instrument on the tank goes, and so does the controller that read it
  for (const i of doc.instruments ?? []) assert.notEqual(i.measures, tank.id)
  // what still names it is left for the person to fix, and said plainly
  for (const e of validateScene(doc).errors)
    assert.match(e, new RegExp(`'${tank.id}'\\) — no part has that id`))

  let car = (
    place(blank(), findItem(undefined, 'car')!, [1, 1]) as { doc: Doc }
  ).doc
  assert.equal(car.switches?.length, 1)
  car = removePart(car, 'car')
  assert.equal(car.switches?.length, 0)

  // an instrument goes with whatever read its signal
  const first = file.instruments![0]!
  const one = removeInstrument(file, 0)
  assert.ok(
    !one.instruments!.some(
      (i) => i.tag === first.tag || i.measures === first.tag,
    ),
  )
  assert.deepEqual(validateScene(one).errors, [])
})

test('removing a link takes its return link', () => {
  const doc = STARTERS.find((s) => s.id === 'small-solar-house')!.doc()
  const i = doc.links.findIndex((l) => l.from === 'board' && l.to === 'battery')
  const next = removeLink(doc, i)
  assert.equal(next.links.length, doc.links.length - 2)
})

test('renaming a part renames it everywhere it is named', () => {
  const file = example('feed-tank-pid.json')
  const tank = file.parts.find((p) => p.behaviour.role === 'storage')!
  const r = renamePart(file, tank.id, 'buffer')
  assert.ok('doc' in r)
  const text = JSON.stringify(r.doc)
  assert.ok(!text.includes(`'${tank.id}'`), 'no signal still names the old id')
  assert.ok(!text.includes(`"${tank.id}"`), 'no field still names the old id')
  assert.deepEqual(validateScene(r.doc).errors, [])
  assert.ok('error' in renamePart(file, tank.id, 'Not Valid'))
})

test('a P&ID palette drops tagged, running equipment with its power off the sheet', () => {
  let doc = blank('pid')
  const add = (key: string, at: [number, number]) => {
    const r = place(doc, findItem('pid', key)!, at)
    assert.ok('doc' in r, `${key}: ${'error' in r ? r.error : ''}`)
    doc = r.doc
    return r.id!
  }
  const feed = add('from-off-sheet', [0, 2])
  const pump = add('CentrifugalPump', [2, 2])
  const tank = add('Tank', [4, 2])
  const lv = add('ControlValve', [6, 2])
  const out = add('to-off-sheet', [7, 2])
  for (const [a, b] of [
    [feed, pump],
    [pump, tank],
    [tank, lv],
    [lv, out],
  ] as const) {
    const r = connect(doc, a, b)
    assert.ok('doc' in r, 'error' in r ? r.error : '')
    doc = r.doc
  }
  const p = doc.parts.find((x) => x.id === pump)!
  assert.equal(p.class, 'CentrifugalPump')
  assert.equal(p.tag, 'P-101')
  assert.equal(doc.parts.find((x) => x.id === tank)!.tag, 'T-101')
  // the pump's power is on the scene, not on the drawing
  const power = doc.links.find((l) => l.to === pump && l.domain === 'electric')
  assert.ok(power, 'the pump is powered')

  // instruments: a transmitter on the tank, a controller on the transmitter
  const lt = placeInstrument(doc, 'LT', [4, 2])
  assert.ok('doc' in lt)
  doc = lt.doc
  const lic = placeInstrument(doc, 'LIC', doc.instruments![0]!.at)
  assert.ok('doc' in lic)
  doc = lic.doc
  assert.deepEqual(
    doc.instruments!.map((i) => [i.tag, i.measures]),
    [
      ['LT-101', tank],
      ['LIC-101', 'LT-101'],
    ],
  )
  doc = patchPart(doc, lv, { tag: 'LV-101' })
  doc = {
    ...doc,
    instruments: doc.instruments!.map((i) =>
      i.tag === 'LIC-101' ? { ...i, drives: lv } : i,
    ),
  }
  doc = patchBehaviour(doc, lv, {
    open: `clamp((prev('${tank}').fill - 0.2) / 0.3, 0, 1)`,
  })
  doc.links.forEach((l, i) => {
    if (l.domain === 'water')
      doc = patchLink(doc, i, { tag: `100-W-00${i + 1}` })
  })
  simulateDay(runs(doc))
  const rules = drawingFindings(runs(doc)).map((f) => f.rule)
  assert.ok(!rules.includes('control-loop'), rules.join())
  assert.ok(!rules.includes('equipment-tag'), rules.join())
})

test('a single-line generator arrives with its fuel off the sheet, and runs', () => {
  let doc = blank('single-line')
  const r1 = place(doc, findItem('single-line', 'Generator')!, [1, 0])
  assert.ok('doc' in r1)
  doc = r1.doc
  const r2 = place(doc, findItem('single-line', 'Load')!, [1, 2])
  assert.ok('doc' in r2)
  doc = r2.doc
  const r = connect(doc, r1.id!, r2.id!)
  assert.ok('doc' in r)
  doc = r.doc
  assert.equal(doc.parts.find((p) => p.id === r1.id)!.tag, '-G1')
  const day = simulateDay(runs(doc))
  const served = day.rows.some((row) => (row.parts[r2.id!]?.in ?? 0) > 0)
  assert.ok(served, 'the load is served by the generator')
})

test('a slider can be read back off a signal', () => {
  assert.deepEqual(dialOf(30), { size: 30 })
  assert.deepEqual(dialOf('2.4 * home(hour) / 1.2'), {
    size: 2.4,
    shape: 'home(hour) / 1.2',
  })
  assert.equal(dialOf("clamp(prev('x').fill, 0, 1)"), undefined)
  assert.equal(profileOf(PROFILES.home.shape), 'home')
  assert.equal(profileOf(undefined), 'flat')
})

test('a signal is checked as it is typed', () => {
  const doc = STARTERS.find((s) => s.id === 'small-solar-house')!.doc()
  assert.deepEqual(checkSignal('12', doc).value, 12)
  const ok = checkSignal("3 * sun(hour) + prev('battery').fill", doc)
  assert.ok(ok.ok)
  assert.equal(ok.day!.length, 24)
  assert.ok(ok.day![13]! > ok.day![2]!)
  assert.match(checkSignal('3 * su(hour)', doc).message!, /did you mean "sun"/)
  assert.match(checkSignal("prev('batery').fill", doc).message!, /battery/)
  assert.match(checkSignal("knob('x')", doc).message!, /no slider/)
  assert.match(
    checkSignal("part('house').in", doc).message!,
    /only works in a check/,
  )
  const half = checkSignal('3 * (hour', doc)
  assert.equal(half.ok, false)
  assert.equal(typeof half.at, 'number')
})

test('history steps back and forward, and typing folds into one step', () => {
  let h = history.start(1)
  h = history.push(h, 2)
  h = history.push(h, 3, true)
  assert.deepEqual(h.past, [1])
  h = history.undo(h)
  assert.equal(h.now, 1)
  h = history.redo(h)
  assert.equal(h.now, 3)
  h = history.push(history.undo(h), 9)
  assert.deepEqual(h.future, [])
  for (let i = 0; i < 200; i++) h = history.push(h, i + 100)
  assert.equal(h.past.length, history.DEPTH)
})

test('the editor opens links, built-ins, saved work and the old playground', async () => {
  const none = { getItem: () => null }
  const { encodeScene } = await import('../format/share.ts')
  const file = example('narrowboat.json')
  const link = await initialDoc(
    { search: '?build=1', hash: `#scene=${await encodeScene(file)}` },
    none,
  )
  assert.equal(link.from, 'link')
  assert.deepEqual(link.doc, file)

  const broken = await initialDoc(
    { search: '?build=1', hash: '#scene=AAAA' },
    none,
  )
  assert.equal(broken.from, 'starter')
  assert.ok(broken.problem)

  const grid = await initialDoc(
    { search: '?build=1&scene=grid', hash: '' },
    none,
  )
  assert.equal(grid.from, 'built-in')
  assert.equal(grid.doc.anigram, 1)

  const saved = await initialDoc(
    { search: '?build=1', hash: '' },
    {
      getItem: (k) => (k === 'anigram.editor.v1' ? JSON.stringify(file) : null),
    },
  )
  assert.equal(saved.from, 'saved')

  const oldSpec = {
    v: 1,
    title: 'Mine',
    size: [8, 5],
    parts: [
      { id: 'wind', kind: 'wind', at: [0, 0] },
      { id: 'house', kind: 'house', at: [2, 0] },
    ],
    links: [{ from: 'wind', to: 'house', domain: 'electric' }],
  }
  const old = await initialDoc(
    { search: '?build=1', hash: '' },
    {
      getItem: (k) =>
        k === 'anigram.build.v1' ? JSON.stringify(oldSpec) : null,
    },
  )
  assert.equal(old.from, 'old-save')
  assert.equal(old.doc.title, 'Mine')
  runs(old.doc)

  const pid = await initialDoc(
    { search: '?build=1&drawing=pid', hash: '' },
    none,
  )
  assert.equal(pid.doc.drawing, 'pid')
})
