// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { EFFORT_UNITS } from '../sim/types.ts'
import type { Domain, PartSpec, Requirement, Scene } from '../sim/types.ts'
import { num } from '../view/format.ts'
import { hourOf, hoursCovered } from './expect.ts'
import type { DayReport, HourRow } from './report.ts'

/*
 * A scene's `requires` list, checked against a simulated day: does the
 * design do what it must? Each requirement is a limit on one part (the tank
 * stays above 15%, the plant gets what it asks for, the pressure stays under
 * 10 bar), so the answer is exact, says how close it came, and gives the
 * sizing search (sizing.ts) something to aim at.
 *
 * Like `expect`, a requirement is checked on the day's whole hours.
 */

export interface RequirementResult {
  /** the requirement in words, given or phrased */
  says: string
  part: string
  reads: Requirement['reads']
  min?: number
  max?: number
  per?: 'day'
  ok: boolean
  /** the hours it was checked at; empty for a day's total */
  hours: number[]
  /** the hours it did not hold */
  failed: number[]
  /** the reading nearest to or furthest past its limit, and when */
  worst?: { value: number; hour?: number }
  /** what the limit and readings are in: `%`, `m³/h`, `bar` */
  unit: string
  /** the verdict in a few words: `yes · lowest 34% at 15:00` */
  answer: string
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** the domain a part's flow in, flow out, or effort is in */
function domainOf(scene: Scene, part: PartSpec, side: 'in' | 'out'): Domain {
  const b = part.behaviour
  if (side === 'out' && b.role === 'converter') return b.output
  const into = scene.links.find((l) => l.to === part.id && !l.loss)
  const out = scene.links.find((l) => l.from === part.id && !l.loss)
  const first = side === 'in' ? (into ?? out) : (out ?? into)
  return first?.domain ?? (b.role === 'converter' ? b.output : 'electric')
}

const QUANTITY: Partial<Record<Domain, string>> = {
  water: 'pressure',
  fuel: 'pressure',
  oil: 'pressure',
  air: 'pressure',
  electric: 'voltage',
  heat: 'temperature',
}

/** the unit a requirement's limit is written in */
export function requirementUnit(scene: Scene, r: Requirement): string {
  const part = scene.parts.find((p) => p.id === r.part)
  if (r.reads === 'served' || r.reads === 'fill') return '%'
  if (!part) return ''
  if (r.reads === 'effort') {
    const d = domainOf(scene, part, 'out')
    return scene.units[d]?.effort ?? EFFORT_UNITS[d] ?? ''
  }
  const u = scene.units[domainOf(scene, part, r.reads)]
  return (r.per === 'day' ? u?.amount : u?.rate) ?? ''
}

/** a reading as a person would write it: `34%`, `140 m³/h`, `8.2 bar` */
export function formatReading(
  r: Pick<Requirement, 'reads'>,
  v: number,
  unit: string,
): string {
  if (r.reads === 'served' || r.reads === 'fill') {
    const pct = v * 100
    return `${pct > 0 && pct < 10 && pct % 1 ? pct.toFixed(1) : Math.round(pct)}%`
  }
  return `${num(v)}${unit ? ` ${unit}` : ''}`
}

/** "Feed tank stays above 15% full", from the requirement's fields */
export function phraseRequirement(scene: Scene, r: Requirement): string {
  const part = scene.parts.find((p) => p.id === r.part)
  const who = part?.label ?? r.part
  const unit = requirementUnit(scene, r)
  const f = (v: number) => formatReading(r, v, unit)
  const when =
    r.at !== undefined
      ? ` at ${hh(r.at)}`
      : r.from !== undefined && r.to !== undefined
        ? ` from ${hh(r.from)} to ${hh(r.to)}`
        : ''
  const day = r.per === 'day' ? ' over the day' : ''
  const { min, max } = r
  const both = min !== undefined && max !== undefined
  switch (r.reads) {
    case 'served':
      if (min !== undefined && min >= 0.999)
        return `${who} ${when || day ? 'gets' : 'always gets'} what it asks for${when}${day}`
      return `${who} gets at least ${f(min ?? 0)} of what it asks for${when}${day}`
    case 'fill':
      if (both)
        return `${who} stays between ${f(min!)} and ${f(max!)} full${when}`
      if (min !== undefined)
        return min <= 0.02
          ? `${who} never runs dry${when}`
          : `${who} stays above ${f(min)} full${when}`
      return max! >= 0.98
        ? `${who} never fills up${when}`
        : `${who} stays below ${f(max!)} full${when}`
    case 'in':
    case 'out': {
      const verb = r.reads === 'in' ? 'gets' : 'delivers'
      const per = r.per === 'day' ? ' a day' : ''
      if (both)
        return `${who} ${verb} between ${f(min!)} and ${f(max!)}${per}${when}`
      if (min !== undefined)
        return `${who} ${verb} at least ${f(min)}${per}${when}`
      return `${who} ${r.reads === 'in' ? 'takes' : 'delivers'} no more than ${f(max!)}${per}${when}`
    }
    case 'effort': {
      const q = (part && QUANTITY[domainOf(scene, part, 'out')]) ?? 'the effort'
      const at = `${q[0]!.toUpperCase()}${q.slice(1)} at ${who.charAt(0).toLowerCase()}${who.slice(1)}`
      if (both) return `${at} stays between ${f(min!)} and ${f(max!)}${when}`
      if (min !== undefined) return `${at} stays above ${f(min)}${when}`
      return `${at} stays under ${f(max!)}${when}`
    }
  }
}

/** the reading at one hour; NaN where there is nothing to read */
function readingAt(r: Requirement, row: HourRow): number {
  const s = row.parts[r.part]
  if (!s) return NaN
  switch (r.reads) {
    case 'served': {
      const d = s.demand ?? 0
      return d <= 1e-6 ? 1 : Math.min(1, s.in / d)
    }
    case 'fill':
      return s.fill ?? 0
    case 'effort':
      return s.effort ?? NaN
    default:
      return s[r.reads]
  }
}

/** the day's total, for `per: 'day'` */
function dayTotal(r: Requirement, report: DayReport): number {
  const t = report.totals[r.part]
  if (!t) return NaN
  if (r.reads === 'served') {
    const asked = t.in + (t.unmet ?? 0)
    return asked <= 1e-6 ? 1 : t.in / asked
  }
  return r.reads === 'out' ? t.out : t.in
}

/** how far inside its limits a reading is, scaled; below zero means it fails */
function slack(r: Requirement, v: number): number {
  if (!Number.isFinite(v)) return -Infinity
  const room = (limit: number) => Math.max(Math.abs(limit), 1e-3)
  let s = Infinity
  // a little give: the day's numbers are rounded to three decimals
  if (r.min !== undefined)
    s = Math.min(s, (v - r.min) / room(r.min) + 1e-3 + 1e-3 / room(r.min))
  if (r.max !== undefined)
    s = Math.min(s, (r.max - v) / room(r.max) + 1e-3 + 1e-3 / room(r.max))
  return s
}

export function checkRequirements(
  scene: Scene,
  report: DayReport,
): RequirementResult[] {
  const rows = new Map(report.rows.slice(1).map((r) => [hourOf(r), r]))
  const all = [...rows.keys()]
  return (scene.requires ?? []).map((r) => {
    const unit = requirementUnit(scene, r)
    const f = (v: number) => formatReading(r, v, unit)
    const base = {
      says: r.says ?? phraseRequirement(scene, r),
      part: r.part,
      reads: r.reads,
      ...(r.min !== undefined ? { min: r.min } : {}),
      ...(r.max !== undefined ? { max: r.max } : {}),
      ...(r.per ? { per: r.per } : {}),
      unit,
    }
    if (r.per === 'day') {
      const v = dayTotal(r, report)
      const ok = slack(r, v) >= 0
      return {
        ...base,
        ok,
        hours: [],
        failed: [],
        worst: { value: v },
        answer: `${ok ? 'yes' : 'no'} · ${f(v)} over the day`,
      }
    }
    const hours = hoursCovered(r, all)
    const readings = hours.map((h) => ({ h, v: readingAt(r, rows.get(h)!) }))
    const failed = readings.filter((x) => slack(r, x.v) < 0).map((x) => x.h)
    const ok = hours.length > 0 && !failed.length
    if (r.reads === 'effort' && readings.every((x) => !Number.isFinite(x.v)))
      return {
        ...base,
        ok: false,
        hours,
        failed: hours,
        answer: `no · nothing sets a ${unit ? `${unit} ` : ''}reading here: give a source or pump an effort`,
      }
    if (!readings.length)
      return {
        ...base,
        ok: false,
        hours,
        failed,
        answer: 'no hour was checked',
      }
    let worst = readings[0]!
    for (const x of readings) if (slack(r, x.v) < slack(r, worst.v)) worst = x
    const low = r.min !== undefined && (r.max === undefined || worst.v < r.min)
    let answer: string
    if (ok) {
      const vs = readings.map((x) => x.v)
      answer =
        r.min !== undefined && r.max !== undefined
          ? `yes · ${f(Math.min(...vs))} to ${f(Math.max(...vs))}`
          : `yes · ${low ? 'lowest' : 'highest'} ${f(worst.v)} at ${hh(worst.h)}`
    } else {
      const span =
        failed.length === hours.length
          ? hours.length > 1
            ? ', every hour'
            : ''
          : `, ${failed.length} of ${hours.length} hours`
      answer = `no · ${low ? 'down to' : 'up to'} ${f(worst.v)} at ${hh(worst.h)}${span}`
    }
    return {
      ...base,
      ok,
      hours,
      failed,
      worst: { value: worst.v, hour: worst.h },
      answer,
    }
  })
}

/** one line per requirement, for a text summary */
export function requirementLines(results: RequirementResult[]): string {
  return results
    .map((r) => `${r.ok ? '✓' : '✗'} ${r.says} — ${r.answer}`)
    .join('\n')
}
