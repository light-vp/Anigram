// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { frameRuns, record, storyboard } from './storyboard.ts'

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

test('a recording slows down at each moment', () => {
  const board = storyboard(garden)
  const runs = frameRuns(board, { seconds: 10, fps: 12 })
  assert.equal(runs.length, 120)
  assert.equal(runs[0], board.from)
  assert.ok(Math.abs(runs.at(-1)! - board.to) < 1e-9)
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i]! >= runs[i - 1]!)
  // the step between frames near a moment is far shorter than in a quiet stretch
  const step = (run: number) => {
    const i = runs.findIndex((r) => r >= run)
    return runs[i + 1]! - runs[i]!
  }
  const full = board.panels.find((p) => p.event === 'full')!.run
  assert.ok(step(full) * 3 < step(23), `${step(full)} vs ${step(23)}`)
  // linger 0 plays the day evenly
  const even = frameRuns(board, { seconds: 4, fps: 6, linger: 0 })
  const gaps = even.slice(1).map((r, i) => r - even[i]!)
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6)
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
