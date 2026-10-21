// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import {
  framePlan,
  frameRuns,
  record,
  sayingAt,
  storyboard,
} from './storyboard.ts'
import { validateScene } from './validate.ts'

const scene = (id: string) => SCENES.find((s) => s.id === id) as Scene
const garden = scene('garden-machine')

test('the garden’s chain is told once, in the order it fires', () => {
  const board = storyboard(garden)
  const events = board.panels.filter((p) => p.kind === 'event')
  assert.deepEqual(
    events.map((p) => p.event),
    ['dawn', 'full', 'timer', 'empty', 'dusk'],
  )
  // the board opens on the opening hour, and reads in time order
  assert.equal(board.panels[0]!.kind, 'start')
  assert.equal(board.panels[0]!.hour, garden.clock.start)
  const runs = board.panels.map((p) => p.run)
  assert.deepEqual(
    runs,
    [...runs].sort((a, b) => a - b),
  )
  assert.deepEqual(
    board.panels.map((p) => p.n),
    board.panels.map((_, i) => i + 1),
  )
  // each event's panel says what the event says
  for (const p of events)
    assert.equal(p.says, garden.events!.find((e) => e.id === p.event)!.says)
})

test('the timer waits its half hour after the float', () => {
  const board = storyboard(garden)
  const at = (id: string) => board.panels.find((p) => p.event === id)!.run
  const wait = at('timer') - at('full')
  assert.ok(wait > 0.45 && wait < 0.6, `waited ${wait} h`)
})

test('a sheet without events is told by its captions', () => {
  const tower = scene('water-tower')
  const board = storyboard(tower)
  assert.ok(board.panels.length >= 3)
  assert.ok(board.panels.every((p) => p.kind !== 'event'))
  const texts = new Set(tower.captions!.map((c) => c.text))
  for (const p of board.panels.slice(1)) assert.ok(texts.has(p.says), p.says)
})

test('an event with nothing to do still marks its moment', () => {
  // the rainwater sheet's events set nothing: they say when the rain comes and the tank fills
  const raw = JSON.parse(
    readFileSync(
      new URL('../../examples/rainwater-pid.json', import.meta.url),
      'utf8',
    ),
  ) as { events: Array<Record<string, unknown>> }
  assert.ok(raw.events.every((e) => e.then === undefined))
  const v = validateScene(raw)
  assert.deepEqual(v.errors, [])
  const told = storyboard(v.scene!)
    .panels.filter((p) => p.kind === 'event')
    .map((p) => p.event)
  assert.deepEqual(told.slice(0, 2), ['rain-starts', 'tank-full'])
  // a list that is there must still be a list
  const bad = validateScene({
    ...raw,
    events: [{ ...raw.events[0], then: {} }],
  })
  assert.ok(bad.errors.some((e) => e.includes('.then')))
})

test('panels, at, from and to', () => {
  assert.equal(storyboard(garden, { panels: 3 }).panels.length, 3)
  const picked = storyboard(garden, { at: [12, 9, 9] })
  assert.deepEqual(
    picked.panels.map((p) => p.hour),
    [9, 12],
  )
  // the morning only: the chain's first links, and nothing after noon
  const morning = storyboard(garden, { from: 8, to: 12 })
  assert.ok(morning.panels.every((p) => p.hour >= 8 && p.hour <= 12))
  assert.ok(morning.panels.some((p) => p.event === 'dawn'))
  assert.ok(!morning.panels.some((p) => p.event === 'dusk'))
})

test('the same scene gives the same board', () => {
  assert.deepEqual(storyboard(garden), storyboard(garden))
})

test('a recording stops at each moment, then glides to the next', () => {
  const board = storyboard(garden)
  const runs = frameRuns(board, { fps: 30 })
  const stops = board.panels.map((p) => p.run)
  assert.equal(runs[0], stops[0])
  assert.equal(runs.at(-1), stops.at(-1))
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i]! >= runs[i - 1]!)
  // two seconds still at every panel
  for (const stop of stops) {
    const still = runs.filter((r) => r === stop).length
    assert.ok(still >= 59 && still <= 62, `${still} frames at ${stop}`)
  }
  // a glide never plays more than about an hour of the day a second, and
  // the long quiet afternoon is cut, hidden behind a dip to paper
  const plan = framePlan(board, { fps: 30 })
  let cuts = 0
  plan.slice(1).forEach((f, i) => {
    const step = f.run - plan[i]!.run
    if (step > 0.2) {
      cuts++
      assert.ok(
        f.fade > 0.8 && plan[i]!.fade > 0.8,
        `a cut in the open at ${f.run}`,
      )
    } else assert.ok(step < 0.07, `raced ${step} h at ${f.run}`)
  })
  assert.ok(cuts >= 1)
  // the length asked for is the length made
  assert.equal(frameRuns(board, { seconds: 10, fps: 12 }).length, 120)
  // the caption under a frame is the last moment it reached
  const full = board.panels.find((p) => p.event === 'full')!
  assert.equal(sayingAt(board, full.run + 0.01), full.says)
  assert.equal(sayingAt(board, 0), board.panels[0]!.says)
})

test('a recording plays the day it was boarded from', () => {
  const board = storyboard(garden)
  const runs = frameRuns(board, { seconds: 4, fps: 6 })
  const seen: Array<{ hour: number; events: number }> = []
  record(garden, runs, { fps: 6 }, (frame) =>
    seen.push({
      hour: frame.hour,
      events: Object.values(frame.events ?? {}).reduce(
        (n, e) => n + e.count,
        0,
      ),
    }),
  )
  assert.equal(seen.length, runs.length)
  seen.forEach((s, i) => {
    const want = (garden.clock.start + runs[i]!) % 24
    assert.ok(Math.abs(s.hour - want) < 1e-6, `${s.hour} vs ${want}`)
  })
  // by the end every link of the chain has fired
  assert.ok(seen.at(-1)!.events >= garden.events!.length)
})
