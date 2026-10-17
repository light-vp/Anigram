// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The grader graded: hand-made "perfect" and "poor" runs of three
 * scenarios, in both modes, must score the way an engineer would rank them.
 *
 *   node --test eval/pid/grade.test.mjs
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { classifyBare, classifyPart, kindOf } from './classify.mjs'
import { answerFor, DATASET } from './derive-dexpi.mjs'
import { grade, lettersMatch, svgTexts, tagDrawn } from './grade.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const fixture = (scenario, variant) => join(here, 'fixtures', scenario, variant)
const built = existsSync(join(here, '../../mcp/dist/anigram-mcp.mjs'))
const mcp = {
  skip: built
    ? false
    : 'the MCP server is not built, so the mcp drawing cannot be rendered',
}

const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))

test('every scenario has an answer key, and every key a scenario', () => {
  const keys = readdirSync(join(here, 'answers')).map((f) =>
    f.replace(/\.json$/, ''),
  )
  const ids = scenarios.map((s) => s.id)
  assert.deepEqual([...keys].sort(), [...ids].sort())
  assert.equal(new Set(ids).size, ids.length, 'scenario ids are unique')
  assert.ok(ids.length >= 22)
  assert.ok(scenarios.filter((s) => s.source.startsWith('dataset')).length >= 7)
  assert.ok(scenarios.filter((s) => s.source === 'written').length >= 15)
  for (const s of scenarios)
    for (const from of Object.values(s.files ?? {}))
      assert.ok(
        existsSync(join(here, '../..', from)),
        `${s.id}: ${from} exists`,
      )
})

test('every tag pattern in every key compiles', () => {
  for (const s of scenarios) {
    const key = JSON.parse(
      readFileSync(join(here, 'answers', `${s.id}.json`), 'utf8'),
    )
    JSON.stringify(key, (k, v) => {
      if (k === 'tag')
        assert.doesNotThrow(() => new RegExp(v), `${s.id}: /${v}/`)
      return v
    })
  }
})

test('the dataset keys are what derive-dexpi.mjs makes from the files', () => {
  for (const id of Object.keys(DATASET)) {
    const committed = JSON.parse(
      readFileSync(join(here, 'answers', `${id}.json`), 'utf8'),
    )
    assert.deepEqual(
      committed,
      answerFor(id),
      `${id}: run node eval/pid/derive-dexpi.mjs`,
    )
  }
})

test('the classifier reads both sides alike', () => {
  const same = [
    [
      {
        class: 'CentrifugalPump',
        kind: 'pump',
        label: 'Transfer pump',
        behaviour: { role: 'converter' },
      },
      'centrifugal pump',
      'pump',
    ],
    [
      {
        class: 'ControlValve',
        kind: 'valve',
        label: 'LCV',
        behaviour: { role: 'gate' },
      },
      'level control valve',
      'control',
    ],
    [
      {
        class: 'CheckValve',
        kind: 'valve',
        label: 'NRV',
        behaviour: { role: 'gate' },
      },
      'swing check valve',
      'check',
    ],
    [
      {
        class: 'SafetyValve',
        kind: 'valve',
        label: 'PSV',
        behaviour: { role: 'gate' },
      },
      'pressure safety valve',
      'relief',
    ],
    [
      {
        class: 'Vessel',
        kind: 'hottank',
        label: 'Production separator',
        behaviour: { role: 'storage' },
      },
      'two-phase separator',
      'separator',
    ],
    [
      {
        class: 'Vessel',
        kind: 'hottank',
        label: 'Packed column',
        behaviour: { role: 'storage' },
      },
      'distillation column',
      'column',
    ],
    [
      { kind: 'factory', label: 'To users', behaviour: { role: 'sink' } },
      'off-page connector',
      'offpage',
    ],
    [
      {
        class: 'HeatExchanger',
        kind: 'valve',
        label: 'After-cooler',
        behaviour: { role: 'gate' },
      },
      'shell and tube exchanger',
      'heat-exchanger',
    ],
  ]
  for (const [part, type, family] of same) {
    assert.ok(
      classifyPart(part).includes(family),
      `${part.label}: ${classifyPart(part)}`,
    )
    assert.ok(
      classifyBare({ type }).includes(family),
      `${type}: ${classifyBare({ type })}`,
    )
  }
  assert.equal(
    kindOf(classifyBare({ type: 'level transmitter' })),
    'instrument',
  )
  assert.equal(kindOf(classifyBare({ type: 'Y-strainer' })), 'fitting')
  assert.equal(
    kindOf(classifyBare({ type: 'gate valve', tag: 'HV-101' })),
    'valve',
  )
  assert.ok(
    classifyBare({ type: 'gate valve', tag: 'HV-101' }).includes('isolation'),
    'the words outrank the tag letters',
  )
})

test('ISA letters match by first letter and a sub-multiset of the rest', () => {
  assert.ok(lettersMatch('LICA', 'LIC'))
  assert.ok(lettersMatch('LAHH', 'LAH'))
  assert.ok(lettersMatch('FFIC', 'FIC'))
  assert.ok(!lettersMatch('FIC', 'FFIC'))
  assert.ok(!lettersMatch('PV', 'PSV'))
  assert.ok(!lettersMatch('TIC', 'LIC'))
})

test('a tag counts as drawn whole or split across an ISA bubble', () => {
  const texts = svgTexts(
    '<svg><text>P-101</text><text>LIC</text><text><tspan>102</tspan></text></svg>',
  )
  const tokens = new Set(
    texts.map((t) => t.toUpperCase().replace(/[\s\-_/]+/g, '')),
  )
  assert.ok(tagDrawn('P-101', texts, tokens))
  assert.ok(tagDrawn('LIC-102', texts, tokens))
  assert.ok(!tagDrawn('P-10', texts, tokens))
  assert.ok(!tagDrawn('LT-102', texts, tokens))
})

for (const scenario of ['transfer-level', 'raw-water-standby', 'i05-draw']) {
  test(`${scenario}: mcp, perfect beats poor`, mcp, async () => {
    const good = await grade(fixture(scenario, 'mcp-perfect'), scenario, {
      mode: 'mcp',
    })
    const bad = await grade(fixture(scenario, 'mcp-poor'), scenario, {
      mode: 'mcp',
    })
    assert.equal(good.delivered, 1)
    // i05's ratio controller takes two flows; an Anigram instrument measures one
    assert.ok(
      good.static >= (scenario === 'i05-draw' ? 0.9 : 0.999),
      `perfect static ${good.static}`,
    )
    assert.ok(
      bad.static < good.static - 0.1,
      `poor ${bad.static} vs perfect ${good.static}`,
    )
    if (good.behaviour !== null) {
      assert.equal(good.behaviour, 1, JSON.stringify(good.missing.behaviour))
      assert.ok(bad.behaviour < 1)
    }
  })

  test(`${scenario}: bare, perfect beats poor`, async () => {
    const good = await grade(fixture(scenario, 'bare-perfect'), scenario, {
      mode: 'bare',
    })
    const bad = await grade(fixture(scenario, 'bare-poor'), scenario, {
      mode: 'bare',
    })
    assert.equal(good.delivered, 1)
    assert.ok(
      good.static >= 0.999,
      `perfect static ${good.static}: ${JSON.stringify(good.missing)}`,
    )
    assert.ok(bad.static < 0.4, `poor static ${bad.static}`)
    // a drawing cannot be simulated
    if (good.behaviour !== null) assert.equal(good.behaviour, 0)
  })
}

test(
  'raw-water-standby: the poor mcp run fails the overflow claim and loses its drawing',
  mcp,
  async () => {
    const r = await grade(
      fixture('raw-water-standby', 'mcp-poor'),
      'raw-water-standby',
      { mode: 'mcp' },
    )
    assert.equal(r.scores.drawn, 0, 'a pictorial sheet is not a P&ID')
    assert.ok(r.missing.behaviour.some((m) => m.includes('never overflows')))
  },
)

test('an empty run folder delivers nothing and scores nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pid-grade-empty-'))
  for (const mode of ['mcp', 'bare']) {
    const r = await grade(dir, 'raw-water-standby', { mode })
    assert.equal(r.delivered, 0)
    assert.equal(r.static, 0)
    assert.equal(r.behaviour, 0)
  }
  const r = await grade(dir, 'transfer-level', { mode: 'bare' })
  assert.equal(r.behaviour, null, 'no claims, no behaviour score')
})
