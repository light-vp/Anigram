#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Re-grade a finished pass with the current grader, from the files run.mjs
 * kept (--keep). A fix to the grader or an answer key can then be applied to
 * every run already paid for, without asking the assistant again; time,
 * tokens and cost are carried over unchanged.
 *
 *   node eval/pid/regrade.mjs eval/pid/results/pass1
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { grade } from './grade.mjs'

const dir = process.argv[2]
if (!dir) throw new Error('usage: node eval/pid/regrade.mjs <pass folder>')

for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const file = join(dir, f)
  const { summary, rows } = JSON.parse(readFileSync(file, 'utf8'))
  for (const r of rows) {
    const kept = join(dir, 'runs', r.mode, `${r.id}-${r.run}`)
    const {
      delivered,
      static: s,
      behaviour,
      scores,
      missing,
      notes,
    } = await grade(kept, r.id, { mode: r.mode })
    Object.assign(r, {
      delivered,
      static: s,
      behaviour,
      scores,
      missing,
      notes,
    })
  }
  const mean = (k, of) =>
    of.length ? of.reduce((a, r) => a + (r[k] ?? 0), 0) / of.length : 0
  summary.delivered = mean('delivered', rows)
  summary.static = mean('static', rows)
  summary.behaviour = mean(
    'behaviour',
    rows.filter((r) => r.behaviour !== null && r.behaviour !== undefined),
  )
  summary.regraded = new Date().toISOString()
  writeFileSync(file, `${JSON.stringify({ summary, rows }, null, 2)}\n`)
  console.log(
    `${summary.mode}: static ${Math.round(100 * summary.static)}%, behaviour ${Math.round(100 * summary.behaviour)}%`,
  )
}
