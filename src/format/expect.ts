// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { compileExpr, NEVER } from '../sim/expr.ts'
import type { Env, Expectation, Scene } from '../sim/types.ts'
import type { Controls, DayReport, HourRow } from './report.ts'

/*
 * A scene's `expect` list, checked against a simulated day. The story a
 * sheet tells ("the battery runs flat overnight, then the grid takes over")
 * becomes something a tool can confirm or refute, so an assistant knows when
 * its numbers are right and CI knows when a change broke a built-in sheet.
 *
 * Checks run on the day's whole hours, the same rows `simulate_scene`
 * tabulates. `knob()` and `on()` read the controls the day was run with.
 */

export interface ExpectResult {
  says: string
  check: string
  ok: boolean
  /** the hours it was checked at */
  hours: number[]
  /** hours where it did not hold (for `sometime`, every checked hour when it never did) */
  failed: number[]
  /** what the parts it reads were doing at the first failure */
  values?: Record<string, number>
}

const hourOf = (row: HourRow) => Math.round(row.hour) % 24

/** the hours a check covers, given the hours the day has rows for */
function window(e: Expectation, hours: number[]): number[] {
  if (e.at !== undefined) return hours.filter((h) => h === e.at! % 24)
  if (e.from !== undefined && e.to !== undefined) {
    const [a, b] = [e.from % 24, e.to % 24]
    return hours.filter((h) => (a <= b ? h >= a && h <= b : h >= a || h <= b))
  }
  return hours
}

/** every part('id').field an expression reads, for explaining a failure */
const READ =
  /part\(\s*(['"])([^'"]+)\1\s*\)\s*\.\s*(in|out|fill|demand|effort)/g

export function checkExpectations(
  scene: Scene,
  report: DayReport,
  controls: Controls = {},
): ExpectResult[] {
  // the day's rows after the opening sample: 24 whole hours, start excluded
  const rows = new Map(report.rows.slice(1).map((r) => [hourOf(r), r]))
  const hours = [...rows.keys()]
  const knob = (id: string) =>
    controls.knobs?.[id] ?? scene.knobs?.find((k) => k.id === id)?.value ?? 0
  const on = (id: string) =>
    controls.switches?.[id] ??
    scene.switches?.find((w) => w.id === id)?.on ??
    false
  const envAt = (row: HourRow): Env => {
    const read = (id: string) => {
      const s = row.parts[id]
      return {
        in: s?.in ?? 0,
        out: s?.out ?? 0,
        fill: s?.fill ?? 0,
        demand: s?.demand ?? 0,
        effort: s?.effort ?? NaN,
      }
    }
    const c = row.controls
    return {
      hour: hourOf(row),
      day: 0,
      knob: c ? (id) => c.knobs[id] ?? knob(id) : knob,
      on: c ? (id) => c.switches[id] ?? on(id) : on,
      prev: read,
      part: read,
      // an event "fired" at an hour if it fired within the hour before it
      fired: (id) => ((row.since?.[id] ?? NEVER) < 1 ? 1 : 0),
      since: (id) => row.since?.[id] ?? NEVER,
    }
  }

  return (scene.expect ?? []).map((e) => {
    const fn = compileExpr(e.check)
    const checked = window(e, hours)
    const failed = checked.filter((h) => !fn(envAt(rows.get(h)!)))
    const ok =
      checked.length > 0 &&
      (e.sometime ? failed.length < checked.length : !failed.length)
    const result: ExpectResult = {
      says: e.says,
      check: e.check,
      ok,
      hours: checked,
      failed: ok ? [] : failed,
    }
    const first = failed[0]
    if (!ok && first !== undefined) {
      const env = envAt(rows.get(first)!)
      const values: Record<string, number> = {}
      for (const [, , id, f] of e.check.matchAll(READ))
        values[`${id}.${f}`] = env.part!(id!)[
          f as 'in' | 'out' | 'fill' | 'demand'
        ]
      if (Object.keys(values).length) result.values = values
    }
    return result
  })
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** one line per expectation, for a text summary */
export function expectLines(results: ExpectResult[]): string {
  return results
    .map((r) => {
      if (r.ok) return `✓ ${r.says}`
      if (!r.hours.length) return `✗ ${r.says} — no hour of the day was checked`
      const when =
        r.failed.length > 4
          ? `${r.failed.slice(0, 4).map(hh).join(', ')} and ${r.failed.length - 4} more`
          : r.failed.map(hh).join(', ')
      const at =
        r.failed.length === r.hours.length && r.hours.length > 1
          ? `never holds (fails at ${when})`
          : `fails at ${when}`
      const vals = r.values
        ? ` (${Object.entries(r.values)
            .map(([k, v]) => `${k} = ${v}`)
            .join(', ')} at ${hh(r.failed[0]!)})`
        : ''
      return `✗ ${r.says} — ${at}${vals}; check: ${r.check}`
    })
    .join('\n')
}
