// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { captionAt } from '../sim/captions.ts'
import { Simulation } from '../sim/runtime.ts'
import type { Frame } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'

/*
 * A scene run headless through a day: what every part did, hour by hour, and
 * everything that went wrong. This is how a scene's story gets checked — the
 * captions should say what the numbers say.
 */

export interface Controls {
  /** slider values by knob id; anything left out keeps the scene's value */
  knobs?: Record<string, number>
  /** switch states by id */
  switches?: Record<string, boolean>
}

export interface HourRow {
  hour: number
  /** per part: the one number that says what it's doing */
  parts: Record<string, PartSample>
  caption: string | null
  alerts: string[]
}

export interface PartSample {
  in: number
  out: number
  /** sinks: what they asked for */
  demand?: number
  /** stores: 0..1 */
  fill?: number
}

export interface DayReport {
  scene: string
  /** the hour the day started at — the scene's own clock start */
  start: number
  rows: HourRow[]
  /** every distinct alert, with the hours it was showing */
  alerts: Array<{ text: string; hours: number[] }>
  /** per part, the day's total throughput (rate × hours) */
  totals: Record<string, { in: number; out: number; unmet?: number }>
}

/** simulated hours per solver step: a two-minute slice */
const STEP = 1 / 30

/** a fresh simulation with the controls set, paused-clock-free and visually still */
export function simulationWith(
  scene: Scene,
  controls: Controls = {},
): Simulation {
  const sim = new Simulation(scene)
  sim.animate = false
  for (const [id, v] of Object.entries(controls.knobs ?? {})) sim.setKnob(id, v)
  for (const [id, on] of Object.entries(controls.switches ?? {}))
    if (sim.switches[id] !== on) sim.toggle(id)
  return sim
}

/** advance a simulation by `hours` of simulated time, in solver-sized steps */
export function advance(sim: Simulation, hours: number) {
  // one real second moves `rate × speed` simulated hours; tick() takes ≤0.1s
  const rate = sim.scene.clock.rate
  sim.setSpeed(STEP / (0.1 * rate))
  const steps = Math.round(hours / STEP)
  for (let i = 0; i < steps; i++) sim.tick(0.1)
}

/** run from the scene's opening hour to `hour`, so the stores have lived the day */
export function frameAt(
  scene: Scene,
  hour: number,
  controls: Controls = {},
): Frame {
  const sim = simulationWith(scene, controls)
  const ahead = (((hour - scene.clock.start) % 24) + 24) % 24
  advance(sim, ahead)
  return sim.frame
}

const round = (v: number) => Math.round(v * 1000) / 1000

export function simulateDay(scene: Scene, controls: Controls = {}): DayReport {
  const sim = simulationWith(scene, controls)
  const rows: HourRow[] = []
  // one entry per part and kind of trouble; a shortfall keeps its worst
  const alerts = new Map<
    string,
    { text: string; hours: number[]; worst: number }
  >()
  const totals: DayReport['totals'] = {}
  for (const p of scene.parts) totals[p.id] = { in: 0, out: 0 }

  const sample = (f: Frame): HourRow => {
    const parts: Record<string, PartSample> = {}
    for (const p of scene.parts) {
      const s = f.parts[p.id]!
      const row: PartSample = { in: round(s.in), out: round(s.out) }
      if (p.behaviour.role === 'sink') row.demand = round(s.demand)
      if (p.behaviour.role === 'storage') row.fill = round(s.fill)
      parts[p.id] = row
    }
    const hour = Math.round(f.hour * 100) / 100
    for (const a of f.alerts) {
      const key = `${a.partId}:${a.kind}:${a.kind === 'limit' ? a.text : ''}`
      const entry = alerts.get(key) ?? { text: a.text, hours: [], worst: 0 }
      const pct = Number(/(\d+)% short/.exec(a.text)?.[1] ?? 0)
      if (pct >= entry.worst) {
        entry.worst = pct
        entry.text = a.text.replace(/(\d+)% short/, 'up to $1% short')
      }
      if (!entry.hours.includes(Math.floor(hour)))
        entry.hours.push(Math.floor(hour))
      alerts.set(key, entry)
    }
    return {
      hour,
      parts,
      caption: captionAt(scene, f.hour),
      alerts: f.alerts.map((a) => a.text),
    }
  }

  rows.push(sample(sim.frame))
  for (let h = 0; h < 24; h++) {
    const per = Math.round(1 / STEP)
    for (let i = 0; i < per; i++) {
      advance(sim, STEP)
      for (const p of scene.parts) {
        const s = sim.frame.parts[p.id]!
        const t = totals[p.id]!
        t.in += s.in * STEP
        t.out += s.out * STEP
        if (p.behaviour.role === 'sink' && !p.behaviour.absorbsSurplus)
          t.unmet = (t.unmet ?? 0) + Math.max(0, s.demand - s.in) * STEP
      }
    }
    rows.push(sample(sim.frame))
  }
  for (const t of Object.values(totals)) {
    t.in = round(t.in)
    t.out = round(t.out)
    if (t.unmet !== undefined) t.unmet = round(t.unmet)
  }
  return {
    scene: scene.id,
    start: scene.clock.start,
    rows,
    alerts: [...alerts.values()].map(({ text, hours }) => ({ text, hours })),
    totals,
  }
}

/** the report as a fixed-width table, one column per part — easy to read in a terminal or a chat */
export function reportTable(
  scene: Scene,
  report: DayReport,
  ids?: string[],
): string {
  const show = ids?.length
    ? scene.parts.filter((p) => ids.includes(p.id))
    : scene.parts
  const fmt = (v: number) =>
    (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)).padStart(6)
  const lines = [
    'hour  ' + show.map((p) => p.id.slice(0, 13).padStart(15)).join(''),
  ]
  for (const r of report.rows.slice(1)) {
    const cells = show.map((p) => {
      const s = r.parts[p.id]!
      const b = p.behaviour
      if (b.role === 'storage')
        return `${fmt(s.in - s.out)} ${((s.fill ?? 0) * 100).toFixed(0).padStart(3)}%`.padStart(
          15,
        )
      if (b.role === 'vent') return fmt(s.in).padStart(15)
      if (b.role === 'sink')
        return `${fmt(s.in)}/${fmt(s.demand ?? 0)}`.padStart(15)
      return fmt(s.out).padStart(15)
    })
    const h = Math.floor(r.hour + 1e-6) % 24
    lines.push(`${String(h).padStart(2, '0')}:00 ${cells.join('')}`)
  }
  lines.push('')
  lines.push(
    'columns: sources/converters show output; sinks in/demand; stores net charge and fill; vents what they took',
  )
  return lines.join('\n')
}
