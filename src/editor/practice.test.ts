// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PACKS } from '../packs/catalogue.ts'
import { suggestTag } from '../packs/checks.ts'
import type { DrawingType } from '../sim/types.ts'
import { paletteFor } from './practice.ts'

const ENGINEERING: DrawingType[] = ['pid', 'pfd', 'single-line', 'fluid-power']

test('every palette symbol is one its practice can draw', () => {
  for (const d of ENGINEERING)
    for (const g of paletteFor(d))
      for (const it of g.items)
        if (it.class)
          assert.ok(it.class in PACKS[d]!.classes, `${d}: ${it.class}`)
})

test('every P&ID class is in the palette, and arrives tagged unless it carries no tag', () => {
  const offered = new Set(
    paletteFor('pid').flatMap((g) => g.items.map((it) => it.class)),
  )
  // what carries no tag of its own, or is tagged by its loop
  const untagged = new Set([
    'OffPageConnector',
    'Junction',
    'ControlValve',
    'PipeReducer',
    'BlindFlange',
    'Funnel',
    'Vent',
    'FlexibleHose',
    'Silencer',
  ])
  for (const cls of Object.keys(PACKS.pid!.classes)) {
    // a motor's only line is its power, which a P&ID leaves off: it is
    // drawn when a scene gives it a process line, not dropped on its own
    if (cls !== 'ElectricMotor')
      assert.ok(offered.has(cls), `${cls} is not in the palette`)
    if (!untagged.has(cls))
      assert.ok(suggestTag('pid', cls, []), `${cls} gets no tag`)
  }
})
