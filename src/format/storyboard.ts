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
 * quickly between them and slows as each one arrives, so a GIF of a Rube
 * Goldberg machine lingers on every link of it.
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
  /** length of the recording in seconds (default 12) */
  seconds?: number
  /** frames a second (default 12) */
  fps?: number
  /** how much the day slows at each panel: 0 plays it evenly (default 5) */
  linger?: number
}

export const MAX_FRAMES = 600

/**
 * the run hour each frame of a recording shows: evenly spread over the
 * stretch, but bunched up around each panel so the moments get screen time
 */
export function frameRuns(
  board: Storyboard,
  opts: RecordOptions = {},
): number[] {
  const seconds = opts.seconds ?? 12
  const fps = opts.fps ?? 12
  const n = Math.max(2, Math.min(MAX_FRAMES, Math.round(seconds * fps)))
  const linger = opts.linger ?? 5
  const { from, to } = board
  // the weight of each slice of the day; a frame lands every equal share of it
  const slices = Math.max(48, Math.ceil((to - from) * 120))
  const width = (to - from) / slices
  const at = board.panels.map((p) => p.run)
  const weight = (run: number) =>
    1 + linger * at.reduce((w, a) => w + Math.exp(-(((run - a) / 0.3) ** 2)), 0)
  const cum = [0]
  for (let i = 0; i < slices; i++)
    cum.push(cum[i]! + weight(from + (i + 0.5) * width) * width)
  const total = cum[slices]!
  const runs: number[] = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1)
    while (j < slices - 1 && cum[j + 1]! < target) j++
    const lo = cum[j]!
    const hi = cum[j + 1]!
    const t = hi > lo ? (target - lo) / (hi - lo) : 0
    runs.push(Math.min(to, from + (j + t) * width))
  }
  return runs
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
  const dt = 1 / (opts.fps ?? 12)
  let at = first
  runs.forEach((run, i) => {
    if (i > 0) sim.advance(Math.max(0, run - at), dt)
    at = run
    each(sim.frame, sim, i)
  })
}

/** the words shown under a recorded frame */
export const recordedCaption = frameCaption
