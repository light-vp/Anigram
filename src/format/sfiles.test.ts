// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { simulateDay } from './report.ts'
import { fromSfiles, parseSfiles, SfilesError, toSfiles } from './sfiles.ts'
import { validateScene } from './validate.ts'

const load = (raw: unknown) => {
  const v = validateScene(structuredClone(raw))
  assert.deepEqual(v.errors, [])
  return v.scene!
}

/** the streams as unit types, so two strings for one flowsheet compare equal */
const streams = (src: string) => {
  const g = parseSfiles(src)
  return g.edges.map(([a, b]) => `${g.units[a]}>${g.units[b]}`).sort()
}

// the two worked examples from the SFILES 2.0 paper's demonstration
const COLUMNS =
  '(raw)(pp)<1(splt)[(hex)(flash)<&|(raw)&|[{bout}(v)(dist)[{bout}(prod)]{tout}(dist){bout}1<4{tout}(mix)<3(prod)]{bin}(abs)<2<6[{tout}(prod)]{bout}(flash){tout}5[{bout}(flash)[{tout}(comp)(comp)2<5]{bout}(flash){tout}3{bout}4]](hex){tin}6'
const INCOMING =
  '(raw)(flash)[{tout}(prod)]{bout}(splt)[(prod)](r)<&|(raw)(flash){tout}&{bout}(prod)|(prod)'

test('the notation: sequences, branches, incoming branches and joins', () => {
  assert.deepEqual(streams('(raw)(pp)(prod)'), ['pp>prod', 'raw>pp'])
  // after a branch, the main line carries on from the unit before it
  assert.deepEqual(streams('(raw)(splt)[(prod)](prod)'), [
    'raw>splt',
    'splt>prod',
    'splt>prod',
  ])
  // an incoming branch flows into the unit before it
  assert.deepEqual(streams('(mix)<&|(raw)&|(prod)'), ['mix>prod', 'raw>mix'])
  // `&` joins without ending, `|` ends without joining
  assert.deepEqual(
    streams(INCOMING).filter((e) => e.endsWith('>r')),
    ['flash>r', 'splt>r'],
  )
  // a recycle, and one past nine
  assert.deepEqual(streams('(raw)(mix)<1(r)(splt)1(prod)'), [
    'mix>r',
    'r>splt',
    'raw>mix',
    'splt>mix',
    'splt>prod',
  ])
  assert.equal(parseSfiles('(raw)(mix)<%12(splt)%12(prod)').recycles, 1)
  // one heat exchanger passed through twice
  const hi = parseSfiles('(raw)(hex){1}(r)(hex){1}(prod)')
  assert.equal(hi.units.length, 4)
  assert.equal(hi.edges.length, 4)
  // numbered names are one unit however often they're written
  assert.equal(
    parseSfiles('(raw-1)(mix-1)(prod-1)n|(raw-2)(mix-1)').units.length,
    4,
  )
  const g = parseSfiles(COLUMNS)
  assert.equal(g.units.length, 20)
  assert.equal(g.edges.length, 25)
  assert.equal(g.recycles, 6)
})

test('a string that is not SFILES says where', () => {
  const bad: Array<[string, RegExp]> = [
    ['(raw)(pp', /"\(" is not SFILES/],
    ['(raw)[(prod)', /never closed/],
    ['(raw)](prod)', /closes no branch/],
    ['(raw)1(prod)', /goes nowhere/],
    ['(raw)(prod)<1', /no join 1/],
    ['(raw)&(prod)', /outside an incoming branch/],
    ['[(raw)]', /with no unit before it/],
    ['', /no units/],
  ]
  for (const [src, re] of bad)
    assert.throws(
      () => parseSfiles(src),
      (e: unknown) => e instanceof SfilesError && re.test(e.message),
      src,
    )
})

test('a flowsheet opens as a PFD that runs', () => {
  const { scene, counts, notes } = fromSfiles(COLUMNS, {
    title: 'Two columns and an absorber',
  })
  const s = load(scene)
  assert.equal(s.drawing, 'pfd')
  assert.equal(s.id, 'two-columns-and-an-absorber')
  assert.deepEqual(counts, { units: 20, streams: 25, recycles: 6, controls: 0 })
  assert.ok(notes.some((n) => n.includes('outlet tags')))
  // major equipment is tagged, and drawn by its class
  const tag = (t: string) => s.parts.find((p) => p.tag === t)
  assert.equal(tag('P-101')?.class, 'CentrifugalPump')
  assert.equal(tag('C-101')?.label, 'Distillation column')
  assert.equal(tag('C-103')?.label, 'Absorption column')
  assert.equal(tag('K-101')?.class, 'Compressor')
  // a PFD has no valve symbol
  assert.equal(s.parts.find((p) => p.id === 'v-1')?.class, undefined)
  assert.ok(s.size[0] <= 40 && s.size[1] <= 40)
  const day = simulateDay(s)
  const products = s.parts.filter((p) => p.behaviour.role === 'sink')
  assert.ok(
    products.some((p) => day.totals[p.id]!.in > 0),
    'product leaves the sheet',
  )
  // drawn as a P&ID, the valve keeps its symbol
  const pid = load(fromSfiles(COLUMNS, { drawing: 'pid' }).scene)
  assert.equal(pid.parts.find((p) => p.id === 'v-1')?.class, 'GateValve')
})

test('control units come out, the streams through them stay joined', () => {
  const { scene, counts, notes } = fromSfiles(
    '(raw)(C){FC}_1(v)<_1(tank)(pp)(prod)',
  )
  const s = load(scene)
  assert.equal(counts.controls, 1)
  assert.ok(notes.some((n) => n.includes('control unit')))
  assert.ok(s.links.some((l) => l.from === 'raw-1' && l.to === 'v-1'))
  assert.equal(
    s.parts.find((p) => p.tag === 'TK-101')?.behaviour.role,
    'storage',
  )
})

test('written back out, a flowsheet reads as the same streams', () => {
  for (const src of [
    COLUMNS,
    INCOMING,
    '(raw)(hex){1}(r)(hex){1}(prod)',
    '(raw)(mix)<1(r)(splt)1(prod)',
  ]) {
    const s = load(fromSfiles(src).scene)
    const { sfiles } = toSfiles(s)
    assert.deepEqual(streams(sfiles), streams(src), sfiles)
  }
  // a later feed that ends in the main line is written as an incoming branch
  const merged = load(fromSfiles('(raw)(mix)<&|(raw)(pp)&|(r)(prod)').scene)
  assert.equal(toSfiles(merged).sfiles, '(raw)(mix)<&|(raw)(pp)&|(r)(prod)')
})

test("Anigram's own P&ID writes as SFILES", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL('../../examples/feed-tank-pid.json', import.meta.url),
      'utf8',
    ),
  )
  const s = load(raw)
  const { sfiles } = toSfiles(s)
  const g = parseSfiles(sfiles)
  assert.ok(g.units.includes('tank'), sfiles)
  assert.ok(g.units.includes('pp'), sfiles)
  assert.ok(g.units.includes('raw') && g.units.includes('prod'), sfiles)
  // and reads back as a sheet that validates
  load(fromSfiles(sfiles).scene)
})
