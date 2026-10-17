// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { captionAt, frameCaption } from '../sim/captions.ts'
import type { Frame, Simulation } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'
import { simulationWith } from './report.ts'
import type { Controls } from './report.ts'

/*
 * A storyboard: the few moments that tell a scene's day, picked from what the
 * simulation really did. Each event that fires is a moment (the first time
 * it fires, so a chain that loops is told once); the scene's captions fill in
 * where nothing fires. The same moments pace a recording: the day plays
 * between them and stops at each one, so a GIF of a Rube Goldberg machine
 * pauses on every link of it.
 *
 * React-free and deterministic: the same scene and controls give the same
 * panels and the same frames, in node or the browser.
 */

/** one moment on the board */
export interface Panel {
  /** 1-based, in the order they happen */
  n: number
  /** hours after the opening hour */
  run: number
  /** the clock, 0–24 */
  hour: number
  says: string
  kind: 'start' | 'event' | 'caption'
  /** the event that fired, for `kind: 'event'` */
  event?: string
}

export interface Storyboard {
  /** the stretch of the day it covers, in hours after the opening hour */
  from: number
  to: number
  panels: Panel[]
}

export interface StoryOptions extends Controls {
  /** most panels on the board (default 8, at most 24) */
  panels?: number
  /** start of the stretch, as a clock hour (default the opening hour) */
  from?: number
  /** end of the stretch, as a clock hour (default a full day after `from`) */
  to?: number
  /** pick these clock hours instead of choosing the moments */
  at?: number[]
}

export const MAX_PANELS = 24
const DEFAULT_PANELS = 8

/** how long after an event fires its panel looks: the ring is still bright and the words are up */
const SHOW_AFTER = 0.1
/** moments closer than this are one moment */
const NEAR = 0.4
/** solver steps the board is read at, in hours */
const STEP = 1 / 30

const wrap24 = (h: number) => ((h % 24) + 24) % 24
const round2 = (h: number) => Math.round(h * 100) / 100

/** run hours after the opening hour to reach clock hour `hour`, in [0, 24) */
function runOf(scene: Scene, hour: number): number {
  return wrap24(hour - scene.clock.start)
}

function span(scene: Scene, opts: StoryOptions): { from: number; to: number } {
  const from = opts.from === undefined ? 0 : runOf(scene, opts.from)
  let to = opts.to === undefined ? from + 24 : runOf(scene, opts.to)
  if (to <= from) to += 24
  return { from, to: Math.min(to, 24) }
}

/** the moments of the day, chosen from what the scene did */
export function storyboard(scene: Scene, opts: StoryOptions = {}): Storyboard {
  const { from, to } = span(scene, opts)
  const max = Math.max(1, Math.min(MAX_PANELS, opts.panels ?? DEFAULT_PANELS))
  const start = scene.clock.start
  const clock = (run: number) => round2(wrap24(start + run))

  if (opts.at?.length) {
    const sim = simulationWith(scene, opts)
    const runs = [...new Set(opts.at.map((h) => runOf(scene, h)))].sort(
      (a, b) => a - b,
    )
    const panels = runs.slice(0, max).map((run, i): Panel => {
      sim.seek(wrap24(start + run))
      return {
        n: i + 1,
        run: round2(run),
        hour: clock(run),
        says: frameCaption(scene, sim.frame) ?? '',
        kind: 'caption',
      }
    })
    return { from, to, panels }
  }

  // walk the stretch once, noting each event the first time it fires
  const fired: Array<{ run: number; id: string; says: string }> = []
  const seen = new Set<string>()
  const says = new Map((scene.events ?? []).map((e) => [e.id, e.says]))
  const sim = simulationWith(scene, opts)
  if (from > 0) sim.seek(wrap24(start + from))
  const counts = (f: Frame) =>
    Object.fromEntries(
      Object.entries(f.events ?? {}).map(([id, s]) => [id, s.count]),
    )
  let before = counts(sim.frame)
  for (let run = from; run < to - 1e-9; run += STEP) {
    sim.advance(Math.min(STEP, to - run))
    const now = counts(sim.frame)
    for (const id of Object.keys(now))
      if (now[id]! > (before[id] ?? 0) && !seen.has(id)) {
        seen.add(id)
        fired.push({ run: run + STEP, id, says: says.get(id) ?? id })
      }
    before = now
  }

  // the captions fill the gaps: each one where it starts
  const captions: Array<{ run: number; says: string }> = []
  for (const c of scene.captions ?? []) {
    const run = runOf(scene, c.from)
    if (run >= from && run < to) captions.push({ run, says: c.text })
  }

  const opening = captionAt(scene, wrap24(start + from)) ?? scene.subtitle ?? ''
  const chosen: Array<Omit<Panel, 'n'>> = [
    { run: from, hour: clock(from), says: opening, kind: 'start' },
  ]
  const clear = (run: number) =>
    chosen.every((p) => Math.abs(p.run - run) >= NEAR)
  // events first: they are the story; then captions, earliest first
  for (const f of fired) {
    if (chosen.length >= max) break
    const run = Math.min(f.run + SHOW_AFTER, to)
    chosen.push({
      run,
      hour: clock(run),
      says: f.says,
      kind: 'event',
      event: f.id,
    })
  }
  for (const c of captions) {
    if (chosen.length >= max) break
    if (!clear(c.run) || c.says === opening) continue
    chosen.push({
      run: c.run,
      hour: clock(c.run),
      says: c.says,
      kind: 'caption',
    })
  }
  const panels = chosen
    .sort((a, b) => a.run - b.run)
    .map((p, i) => ({ ...p, n: i + 1, run: round2(p.run) }))
  return { from: round2(from), to: round2(to), panels }
}

export interface RecordOptions {
  /** length of the recording in seconds (default: as long as its moments need) */
  seconds?: number
  /** frames a second (default 30) */
  fps?: number
  /** seconds the clock stops at each moment, while what flows keeps moving (default 2) */
  hold?: number
}

export const DEFAULT_FPS = 30
export const DEFAULT_HOLD = 2
export const MAX_FRAMES = 1800

/** seconds a recording takes to travel `hours` of the day between two moments */
const travelFor = (hours: number) => Math.min(3, Math.max(1, hours * 0.6))

/** eases in and out of each moment, so the clock never jumps */
const ease = (t: number) => t * t * (3 - 2 * t)

/**
 * the run hour each frame of a recording shows. The clock stops at each panel
 * for `hold` seconds, long enough to read what happened, then glides to the
 * next; the recording starts at the first panel and ends on the last, so a
 * quiet night after the story is not played.
 */
export function frameRuns(
  board: Storyboard,
  opts: RecordOptions = {},
): number[] {
  const fps = opts.fps ?? DEFAULT_FPS
  const stops = [...new Set(board.panels.map((p) => p.run))].sort(
    (a, b) => a - b,
  )
  if (!stops.length) stops.push(board.from)
  let hold = opts.hold ?? DEFAULT_HOLD
  let travels = stops.slice(1).map((r, i) => travelFor(r - stops[i]!))
  const natural = hold * stops.length + travels.reduce((a, b) => a + b, 0)
  if (opts.seconds !== undefined && natural > 0) {
    const k = opts.seconds / natural
    hold *= k
    travels = travels.map((t) => t * k)
  }
  // the recording as stretches of seconds: a hold at each stop, a glide between
  const legs: Array<{ seconds: number; from: number; to: number }> = []
  stops.forEach((stop, i) => {
    legs.push({ seconds: hold, from: stop, to: stop })
    const t = travels[i]
    if (t !== undefined)
      legs.push({ seconds: t, from: stop, to: stops[i + 1]! })
  })
  const total = legs.reduce((a, l) => a + l.seconds, 0)
  const n = Math.max(2, Math.min(MAX_FRAMES, Math.round(total * fps)))
  const runs: number[] = []
  let leg = 0
  let start = 0
  for (let k = 0; k < n; k++) {
    // the last frame lands on the last stop
    const at = (total * k) / (n - 1)
    while (leg < legs.length - 1 && at > start + legs[leg]!.seconds) {
      start += legs[leg]!.seconds
      leg++
    }
    const l = legs[leg]!
    const t = l.seconds > 0 ? Math.min(1, (at - start) / l.seconds) : 1
    runs.push(l.from + (l.to - l.from) * ease(t))
  }
  return runs
}

/** what a recorded frame at `run` says: the last moment the recording reached */
export function sayingAt(board: Storyboard, run: number): string {
  let says = board.panels[0]?.says ?? ''
  for (const p of board.panels) if (p.run <= run + 1e-9) says = p.says
  return says
}

/**
 * play the stretch, calling `each` with the frame at every run hour in
 * `runs` (as `frameRuns` gives them). What travels along the links moves as
 * the recording's own seconds pass, so it flows at the same pace however fast
 * the day is going.
 */
export function record(
  scene: Scene,
  runs: number[],
  opts: Controls & { fps?: number },
  each: (frame: Frame, sim: Simulation, i: number) => void,
): void {
  const sim = simulationWith(scene, opts)
  sim.animate = true
  const start = scene.clock.start
  const first = runs[0] ?? 0
  if (first > 0) sim.seek(wrap24(start + first))
  const dt = 1 / (opts.fps ?? DEFAULT_FPS)
  let at = first
  runs.forEach((run, i) => {
    if (i > 0) sim.advance(Math.max(0, run - at), dt)
    at = run
    each(sim.frame, sim, i)
  })
}
