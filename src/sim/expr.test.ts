// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ExprError, compileExpr, exprRefs } from './expr.ts'
import { sun } from './profiles.ts'
import type { Env } from './types.ts'

const env = (over: Partial<Env> = {}): Env => ({
  hour: 12,
  day: 0,
  knob: (id) => (id === 'cloud' ? 0.5 : 0),
  on: (id) => id === 'mains',
  prev: () => ({ in: 40, out: 10, fill: 0.25, effort: 3 }),
  ...over,
})

const run = (src: string, e = env()) => compileExpr(src)(e)

test('arithmetic follows the usual precedence', () => {
  assert.equal(run('1 + 2 * 3'), 7)
  assert.equal(run('(1 + 2) * 3'), 9)
  assert.equal(run('-2 * -3'), 6)
  assert.equal(run('7 % 4'), 3)
  assert.equal(run('1e3 / .5'), 2000)
})

test('signals read the clock, the controls and the last tick', () => {
  assert.equal(
    run("32 * sun(hour) * (1 - 0.85 * knob('cloud'))"),
    32 * sun(12) * (1 - 0.425),
  )
  assert.equal(run("on('mains') ? 1 : 0"), 1)
  assert.equal(run("on('ev') ? 7 : 0"), 0)
  assert.equal(run("0.35 * prev('servers').in"), 14)
  assert.equal(run("prev('tank').fill"), 0.25)
})

test('between() wraps past midnight', () => {
  assert.equal(run('between(hour, 16.5, 21.5)', env({ hour: 18 })), 1)
  assert.equal(run('between(hour, 16.5, 21.5)', env({ hour: 22 })), 0)
  assert.equal(run('between(hour, 22, 6)', env({ hour: 2 })), 1)
  assert.equal(run('between(hour, 22, 6)', env({ hour: 12 })), 0)
})

test('logic short-circuits and nests', () => {
  assert.equal(run('hour >= 6 && hour < 20 ? 1 : 0'), 1)
  assert.equal(run('hour < 6 || hour > 20'), 0)
  assert.equal(run('!0'), 1)
  assert.equal(run('hour < 6 ? 1 : hour < 18 ? 2 : 3'), 2)
})

test('a result that is not a finite number becomes 0', () => {
  assert.equal(run('1 / 0'), 0)
  assert.equal(run('sqrt(-1)'), 0)
})

test('bad expressions fail with a position, and nothing reaches JavaScript', () => {
  for (const bad of [
    'process.exit()',
    'constructor',
    "knob('a'",
    'sun()',
    'sun(hour',
    "prev('x')",
    "prev('x').constructor",
    'knob(hour)',
    'hour hour',
    '"text"',
    'alert(1)',
  ]) {
    assert.throws(() => compileExpr(bad), ExprError, bad)
  }
})

test('refs lists the knobs, switches and parts an expression reads', () => {
  const r = exprRefs("on('ev') ? knob('rate') * prev('car').in : knob('idle')")
  assert.deepEqual([...r.knobs].sort(), ['idle', 'rate'])
  assert.deepEqual([...r.switches], ['ev'])
  assert.deepEqual([...r.parts], ['car'])
})

test('part() reads a part as it is now, with .demand, for expect checks', () => {
  const r = exprRefs(
    "part('house').in >= part('house').demand && prev('pv').out > 0",
  )
  assert.deepEqual([...r.reads], ['house'])
  assert.deepEqual([...r.parts], ['pv'])
  const now = { in: 2, out: 0, fill: 0, demand: 3, effort: 1 }
  const fn = compileExpr("part('house').demand - part('house').in")
  assert.equal(
    fn({
      hour: 0,
      day: 0,
      knob: () => 0,
      on: () => false,
      prev: () => now,
      part: () => now,
    }),
    1,
  )
  // without a part() reader, as in a running signal, it reads as nothing
  assert.equal(
    fn({ hour: 0, day: 0, knob: () => 0, on: () => false, prev: () => now }),
    0,
  )
  assert.throws(
    () => compileExpr("prev('x').demand"),
    /only \.in, \.out, \.fill or \.effort can follow prev\(\)/,
  )
  assert.throws(
    () => compileExpr("part('x')"),
    /needs a field: \.in, \.out, \.fill, \.demand or \.effort/,
  )
  assert.throws(
    () => compileExpr("part('x').level"),
    /\.effort can follow part\(\)/,
  )
})

test('a mistyped name or function suggests the right one', () => {
  assert.throws(() => compileExpr('su(hour)'), /did you mean "sun"/)
  assert.throws(() => compileExpr('hourr * 2'), /did you mean "hour"/)
})

test('runaway expressions are refused, not crashed on', () => {
  assert.throws(
    () => compileExpr('('.repeat(200) + '1' + ')'.repeat(200)),
    (e) => e instanceof ExprError && /nests deeper/.test(e.message),
  )
  assert.throws(() => compileExpr('-'.repeat(200) + '1'), ExprError)
  assert.throws(() => compileExpr('1+'.repeat(1500) + '1'), /characters long/)
})

test('fired() and since() read events, and effort is a field', () => {
  const r = exprRefs("fired('ball') || since('lever') < 0.5")
  assert.deepEqual([...r.events].sort(), ['ball', 'lever'])
  const fn = compileExpr("fired('ball') + since('lever') + prev('p').effort")
  const env = {
    hour: 0,
    day: 0,
    knob: () => 0,
    on: () => false,
    prev: () => ({ in: 0, out: 0, fill: 0, effort: 3 }),
  }
  assert.equal(
    fn({
      ...env,
      fired: () => 1,
      since: (id: string) => (id === 'lever' ? 2 : 0),
    }),
    6,
  )
  // with no events running, nothing has fired, long ago
  assert.equal(compileExpr("since('x') > 1000")(env), 1)
  assert.throws(() => compileExpr('fired(1)'), /quoted id/)
})
