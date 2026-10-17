#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Put the passes side by side: with Anigram (mcp) against without (bare),
 * overall, by kind of scenario, and per scenario. Markdown to stdout.
 *
 *   node eval/pid/report.mjs eval/pid/results/pass1 eval/pid/results/pass2
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))
const kindOf = (id) => scenarios.find((c) => c.id === id)?.source ?? ''

const rows = process.argv.slice(2).flatMap((dir, p) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) =>
      JSON.parse(readFileSync(join(dir, f), 'utf8')).rows.map((r) => ({
        ...r,
        pass: p + 1,
      })),
    ),
)
const modes = ['mcp', 'bare']
const of = (mode, f = () => true) => rows.filter((r) => r.mode === mode && f(r))
const mean = (xs, k) =>
  xs.length ? xs.reduce((a, r) => a + (k(r) ?? 0), 0) / xs.length : NaN
const pct = (v) => (Number.isNaN(v) ? '–' : `${Math.round(100 * v)}%`)
const claims = (r) => r.behaviour !== null && r.behaviour !== undefined
const hasTokens = (r) => r.tokens && r.tokens.total > 0
const k = (n) => (Number.isNaN(n) ? '–' : `${Math.round(n / 1000)}k`)

console.log('| | with Anigram | without |')
console.log('| --- | --- | --- |')
const line = (label, f) =>
  console.log(`| ${label} | ${modes.map((m) => f(of(m))).join(' | ')} |`)
line('runs', (xs) => xs.length)
line('delivered', (xs) => pct(mean(xs, (r) => r.delivered)))
line('static score', (xs) => pct(mean(xs, (r) => r.static)))
line('behaviour verified', (xs) =>
  pct(mean(xs.filter(claims), (r) => r.behaviour)),
)
for (const cat of [
  'equipment',
  'valves',
  'instruments',
  'connections',
  'loops',
  'tags',
  'drawn',
])
  line(`· ${cat}`, (xs) => {
    const with_ = xs.filter((r) => r.scores?.[cat] !== undefined)
    return pct(mean(with_, (r) => r.scores[cat]))
  })
line('seconds a run (mean)', (xs) => Math.round(mean(xs, (r) => r.seconds)))
line('cost a run (mean)', (xs) => `$${mean(xs, (r) => r.cost).toFixed(2)}`)
line(
  'cost, all runs',
  (xs) => `$${xs.reduce((a, r) => a + r.cost, 0).toFixed(2)}`,
)
line('tokens a run, total', (xs) =>
  k(mean(xs.filter(hasTokens), (r) => r.tokens.total)),
)
line('· output', (xs) => k(mean(xs.filter(hasTokens), (r) => r.tokens.output)))
line('· cache reads', (xs) =>
  k(mean(xs.filter(hasTokens), (r) => r.tokens.cacheRead)),
)
line('· cache writes + fresh input', (xs) =>
  k(mean(xs.filter(hasTokens), (r) => r.tokens.cacheWrite + r.tokens.input)),
)
line('tool calls a run', (xs) => mean(xs, (r) => r.calls).toFixed(1))

console.log('\n| kind of scenario | runs | static with | static without |')
console.log('| --- | --- | --- | --- |')
for (const kind of [...new Set(scenarios.map((c) => kindOf(c.id)))]) {
  const f = (r) => kindOf(r.id) === kind
  console.log(
    `| ${kind} | ${of('mcp', f).length} + ${of('bare', f).length} | ${pct(mean(of('mcp', f), (r) => r.static))} | ${pct(mean(of('bare', f), (r) => r.static))} |`,
  )
}

console.log(
  '\n| scenario | static with | static without | behaviour with | seconds with / without | tokens with / without |',
)
console.log('| --- | --- | --- | --- | --- | --- |')
for (const { id } of scenarios) {
  const m = of('mcp', (r) => r.id === id)
  const b = of('bare', (r) => r.id === id)
  const each = (xs, f) => xs.map(f).join(' / ')
  console.log(
    `| ${id} | ${each(m, (r) => pct(r.static))} | ${each(b, (r) => pct(r.static))} | ${m.some(claims) ? each(m, (r) => pct(r.behaviour)) : '–'} | ${Math.round(mean(m, (r) => r.seconds))} / ${Math.round(mean(b, (r) => r.seconds))} | ${k(mean(m.filter(hasTokens), (r) => r.tokens.total))} / ${k(mean(b.filter(hasTokens), (r) => r.tokens.total))} |`,
  )
}
