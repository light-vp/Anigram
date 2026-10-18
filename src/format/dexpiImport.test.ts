// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { toDexpi } from './dexpi.ts'
import { fromDexpi } from './dexpiImport.ts'
import { simulateDay } from './report.ts'
import { validateScene } from './validate.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const load = (raw: unknown) => {
  const v = validateScene(structuredClone(raw))
  assert.deepEqual(v.errors, [])
  return v.scene!
}

test("DEXPI's reference P&ID opens, with its plant and loops", () => {
  const { scene, counts, notes } = fromDexpi(fixture('dexpi-c01-reference.xml'))
  const s = load(scene)
  assert.equal(s.drawing, 'pid')
  assert.equal(s.title, 'DEXPI example PID')
  assert.equal(s.sheet, '123/A93')
  assert.equal(s.titleBlock?.owner, 'Oil & Gas, Inc.')
  assert.deepEqual(counts, {
    equipment: 5,
    valves: 11,
    lines: 11,
    instruments: 4,
    fittings: 3,
  })
  const tag = (t: string) => s.parts.find((p) => p.tag === t)
  assert.equal(tag('P-4711')?.class, 'CentrifugalPump')
  assert.equal(tag('P-4712')?.class, 'PositiveDisplacementPump')
  assert.equal(tag('T-4750')?.class, 'Tank')
  assert.equal(tag('H-1007')?.class, 'PlateHeatExchanger')
  // the three actuated valves are control valves, each driven by its loop
  for (const [valve, by] of [
    ['PV-4712.02', 'PICSA-4712.02'],
    ['TV-4750.03', 'TICSA-4750.03'],
    ['HV-4750.01', 'HS-4750.01'],
  ] as const) {
    const v = tag(valve)
    assert.equal(v?.class, 'ControlValve', valve)
    assert.equal(s.instruments!.find((x) => x.tag === by)?.drives, v!.id)
  }
  // the safety valve and the butterfly valve keep their own symbols
  assert.ok(s.parts.some((p) => p.class === 'SafetyValve'))
  assert.ok(s.parts.some((p) => p.class === 'ButterflyValve'))
  assert.ok(notes.some((n) => /guessed/.test(n)))
})

test('the reference P&ID runs: product flows through, the tank fills and the exchangers take heat', () => {
  const s = load(fromDexpi(fixture('dexpi-c01-reference.xml')).scene)
  const day = simulateDay(s)
  const out = s.parts.find(
    (p) => p.behaviour.role === 'sink' && p.class === 'OffPageConnector',
  )!
  assert.ok(day.totals[out.id]!.in > 0, 'product leaves the sheet')
  const tank = s.parts.find((p) => p.tag === 'T-4750')!
  const fills = day.rows.map((r) => r.parts[tank.id]!.fill!)
  assert.ok(
    Math.max(...fills) - Math.min(...fills) > 0.05,
    'the tank level moves',
  )
  const h = s.parts.find((p) => p.tag === 'H-1007')!
  assert.ok(day.totals[h.id]!.in > day.totals[h.id]!.out, 'it takes heat in')
})

test("Anigram's own DEXPI comes back as the same plant", () => {
  const feed = load(
    JSON.parse(
      readFileSync(
        new URL('../../examples/feed-tank-pid.json', import.meta.url),
        'utf8',
      ),
    ),
  )
  const back = load(fromDexpi(toDexpi(feed).xml).scene)
  const tags = (sc: typeof feed) =>
    sc.parts
      .map((p) => p.tag)
      .filter(Boolean)
      .sort()
  assert.deepEqual(tags(back), tags(feed))
  const cls = (sc: typeof feed) =>
    Object.fromEntries(
      sc.parts.filter((p) => p.tag).map((p) => [p.tag, p.class]),
    )
  assert.deepEqual(cls(back), cls(feed))
  assert.deepEqual(
    back.instruments!.map((x) => x.tag).sort(),
    feed.instruments!.map((x) => x.tag).sort(),
  )
  const lic = back.instruments!.find((x) => x.tag === 'LIC-101')!
  assert.equal(back.parts.find((p) => p.id === lic.drives)?.tag, 'LV-101')
  assert.equal(
    back.parts.find(
      (p) =>
        p.id === back.instruments!.find((x) => x.tag === 'LT-101')!.measures,
    )?.tag,
    'T-101',
  )
  // a line keeps its number through a valve, so each pipe of it carries it
  const lines = (sc: typeof feed) =>
    [...new Set(sc.links.map((l) => l.tag).filter(Boolean))].sort()
  assert.deepEqual(lines(back), lines(feed))
})

test('a column with its instrument taps, and a ratio loop, open cleanly', () => {
  for (const f of ['dexpi-c02-column.xml', 'dexpi-i05-ratio-control.xml']) {
    const { scene } = fromDexpi(fixture(f))
    const s = load(scene)
    assert.ok(s.instruments?.length, f)
  }
  // the column's sections hold packing, so it draws as a packed column
  const column = load(fromDexpi(fixture('dexpi-c02-column.xml')).scene)
  assert.ok(column.parts.some((p) => p.class === 'PackedColumn'))
  // the ratio controller is numbered `031.` in the file: it keeps its loop number
  const ratio = load(fromDexpi(fixture('dexpi-i05-ratio-control.xml')).scene)
  assert.ok(ratio.instruments?.some((i) => i.tag === 'FFIC-031'))
})

test('the layout follows the file, or the flow when asked', () => {
  const xml = fixture('dexpi-c01-reference.xml')
  const drawn = fromDexpi(xml, { layout: 'drawing' }).scene
  const flow = fromDexpi(xml, { layout: 'flow' }).scene
  const at = (sc: typeof drawn, t: string) =>
    sc.parts.find((p) => p.tag === t)!.at
  // as drawn, the feed pump sits left of and below the tank
  assert.ok(at(drawn, 'P-4711')[0] < at(drawn, 'T-4750')[0])
  assert.ok(at(drawn, 'P-4711')[1] > at(drawn, 'T-4750')[1])
  assert.notDeepEqual(at(flow, 'P-4711'), at(drawn, 'P-4711'))
  // no two parts share a cell
  for (const sc of [drawn, flow]) {
    const cells = sc.parts.map((p) => p.at.join(','))
    assert.equal(new Set(cells).size, cells.length)
  }
})

test('what is not a P&ID says so', () => {
  assert.throws(() => fromDexpi('<svg/>'), /not a DEXPI file/)
  assert.throws(
    () =>
      fromDexpi(
        '<PlantModel><Equipment ID="T-1" ComponentClass="Tank"/></PlantModel>',
      ),
    /nothing to animate/,
  )
})
