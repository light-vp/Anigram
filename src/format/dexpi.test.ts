// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { STARTERS } from '../packs/starters.ts'
import { SCENES } from '../scenes/index.ts'
import { toDexpi } from './dexpi.ts'
import { validateScene } from './validate.ts'

const load = (raw: unknown) => validateScene(structuredClone(raw)).scene!
const feed = load(
  JSON.parse(
    readFileSync(
      new URL('../../examples/feed-tank-pid.json', import.meta.url),
      'utf8',
    ),
  ),
)
const at = new Date(Date.UTC(2026, 9, 11, 12, 0, 0))

/** every tag closes in order: the XML is well formed */
function wellFormed(xml: string) {
  const stack: string[] = []
  for (const [, close, name, self] of xml.matchAll(
    /<(\/?)([A-Za-z]+)[^>]*?(\/?)>/g,
  )) {
    if (self) continue
    if (close) assert.equal(stack.pop(), name)
    else stack.push(name!)
  }
  assert.deepEqual(stack, [])
}

test('the reference P&ID goes across whole and well formed', () => {
  const { xml, counts, notes } = toDexpi(feed, { now: at })
  wellFormed(xml)
  assert.deepEqual(notes, [])
  assert.deepEqual(counts, {
    equipment: 2,
    lines: 4,
    segments: 4,
    instruments: 3,
    loops: 2,
  })
  assert.match(xml, /SchemaVersion="4\.1\.1"/)
  assert.match(xml, /Date="2026-10-11" Time="12:00:00"/)
  for (const v of [
    'CentrifugalPump',
    'Tank',
    'CheckValve',
    'GlobeValve',
    'FlowInPipeOffPageConnector',
    'FlowOutPipeOffPageConnector',
    'ControlledActuator',
  ])
    assert.match(xml, new RegExp(`ComponentClass="${v}"`), v)
  assert.match(xml, /Name="TagNameAssignmentClass"[^>]*Value="P101"/)
  assert.match(xml, /Name="LineNumberAssignmentClass"[^>]*Value="150-W-101"/)
  assert.match(xml, /Name="DrawingNumberAssignmentClass"[^>]*Value="PID-001"/)
})

test('every reference points at something in the file', () => {
  for (const scene of [feed, load(STARTERS.pid)]) {
    const { xml } = toDexpi(scene, { now: at })
    const ids = new Set([...xml.matchAll(/ ID="([^"]+)"/g)].map((m) => m[1]))
    const refs = [...xml.matchAll(/ (?:ItemID|FromID|ToID)="([^"]*)"/g)].map(
      (m) => m[1],
    )
    assert.ok(refs.length > 10)
    for (const r of refs) assert.ok(ids.has(r), `${r} is not in the file`)
    assert.equal(ids.size, [...xml.matchAll(/ ID="/g)].length, 'ids are unique')
  }
})

test('a level loop reads tank to controller to valve', () => {
  const { xml } = toDexpi(feed, { now: at })
  // LT-101 is located in the tank, and LIC-101 actuates the control valve
  assert.match(
    xml,
    /ProcessSignalGeneratingFunctionNumberAssignmentClass"[^>]*Value="LE101"[\s\S]*?is located in" ItemID="Tank-1"/,
  )
  assert.match(
    xml,
    /OperatedValveReference[\s\S]*?refers to" ItemID="GlobeValve-1"/,
  )
  assert.match(
    xml,
    /ProcessInstrumentationFunctionsAssignmentClass"[^>]*Value="IC"/,
  )
})

test('a line keeps its number through a valve unless it changes there', () => {
  const { xml } = toDexpi(feed, { now: at })
  // 100-W-102 runs pump to tank through the non-return valve in one segment
  const seg =
    /LineNumberAssignmentClass"[^>]*Value="100-W-102"[\s\S]*?<\/PipingNetworkSystem>/.exec(
      xml,
    )![0]
  assert.match(seg, /ComponentClass="CheckValve"/)
  assert.match(xml, /FromID="GlobeValve-1" FromNode="2"/)
})

test('only a P&ID exports, and what cannot go across is said', () => {
  assert.throws(() => toDexpi(load(SCENES[0])), /DEXPI describes P&IDs/)
  const s = structuredClone(STARTERS.pid) as unknown as {
    parts: Array<{ id: string; class?: string; kind: string }>
  }
  s.parts.find((p) => p.id === 'tank')!.class = undefined
  s.parts.find((p) => p.id === 'tank')!.kind = 'house'
  const r = toDexpi(load(s), { now: at })
  assert.ok(
    r.notes.some((n) => /no DEXPI class/.test(n)),
    r.notes.join('\n'),
  )
  wellFormed(r.xml)
})
