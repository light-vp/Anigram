// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { frameCaption } from '../sim/captions.ts'
import { effortUnit, formatEffort } from '../sim/effort.ts'
import { NEVER } from '../sim/expr.ts'
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
  /**
   * on a sheet with events: hours since each last fired, and the controls
   * as the chain had left them
   */
  since?: Record<string, number>
  controls?: {
    knobs: Record<string, number>
    switches: Record<string, boolean>
  }
}

export interface PartSample {
  in: number
  out: number
  /** sinks: what they asked for */
  demand?: number
  /** stores: 0..1 */
  fill?: number
  /** pressure, voltage or temperature at its outlet, where it has one */
  effort?: number
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
  /** each event in the chain and the hours it fired in, in the order they first fired */
  events?: Array<{ id: string; says: string; hours: number[] }>
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
  sim.seek(hour)
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
      if (Number.isFinite(s.effort)) row.effort = round(s.effort)
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
    const row: HourRow = {
      hour,
      parts,
      caption: frameCaption(scene, f),
      alerts: f.alerts.map((a) => a.text),
    }
    if (scene.events?.length) {
      row.since = Object.fromEntries(
        Object.entries(f.events).map(([id, e]) => [
          id,
          Number.isFinite(e.since) ? round(e.since) : NEVER,
        ]),
      )
      row.controls = {
        knobs: Object.fromEntries(
          (scene.knobs ?? []).map((k) => [k.id, sim.knob(k.id)]),
        ),
        switches: Object.fromEntries(
          (scene.switches ?? []).map((w) => [w.id, sim.switchOn(w.id)]),
        ),
      }
    }
    return row
  }
  /** when each event fired, by the hour it fired in */
  const fired = new Map<string, number[]>()
  const counts = new Map<string, number>()
  const noteEvents = () => {
    for (const [id, e] of Object.entries(sim.frame.events)) {
      if (e.count === (counts.get(id) ?? 0)) continue
      counts.set(id, e.count)
      const h = Math.floor(sim.frame.hour + 1e-6) % 24
      const hours = fired.get(id) ?? []
      if (!hours.includes(h)) hours.push(h)
      fired.set(id, hours)
    }
  }
  noteEvents()

  rows.push(sample(sim.frame))
  for (let h = 0; h < 24; h++) {
    const per = Math.round(1 / STEP)
    for (let i = 0; i < per; i++) {
      advance(sim, STEP)
      noteEvents()
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
  const report: DayReport = {
    scene: scene.id,
    start: scene.clock.start,
    rows,
    alerts: [...alerts.values()].map(({ text, hours }) => ({ text, hours })),
    totals,
  }
  if (scene.events?.length)
    report.events = [...fired].map(([id, hours]) => ({
      id,
      says: scene.events!.find((e) => e.id === id)!.says,
      hours,
    }))
  return report
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

/**
 * the pressures, voltages and temperatures through the day, for the parts
 * that set, add, lose or are rated for one; empty when there are none
 */
export function effortTable(scene: Scene, report: DayReport): string {
  const show = scene.parts.filter((p) => p.effort)
  if (!show.length) return ''
  const unit = (id: string) => effortUnit(scene, id)
  const lines = [
    'hour  ' +
      show
        .map((p) => `${p.id.slice(0, 9)} ${unit(p.id)}`.trim().padStart(15))
        .join(''),
  ]
  for (const r of report.rows.slice(1)) {
    const cells = show.map((p) => {
      const e = r.parts[p.id]!.effort
      return (e === undefined ? '–' : formatEffort(e, '')).padStart(15)
    })
    const h = Math.floor(r.hour + 1e-6) % 24
    lines.push(`${String(h).padStart(2, '0')}:00 ${cells.join('')}`)
  }
  return lines.join('\n')
}
