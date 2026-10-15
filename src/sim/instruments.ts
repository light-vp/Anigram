// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { effortUnit } from './effort.ts'
import { compileExpr } from './expr.ts'
import type { Compiled } from './expr.ts'
import type { InstrumentSpec, Scene } from './types.ts'

/*
 * Instruments as ISA-5.1 has them: a tag whose first letter is what is
 * measured and whose later letters are what the instrument does with it,
 * then a loop number. `LIC-101` is a level indicating controller in loop 101.
 * React-free, so the validator, the runtime and the guide share it.
 */

/** what the first letter of a tag measures */
export const MEASURED: Record<string, string> = {
  A: 'analysis',
  B: 'burner, combustion',
  C: "user's choice",
  D: "user's choice",
  E: 'voltage',
  F: 'flow',
  G: "user's choice",
  H: 'hand',
  I: 'current',
  J: 'power',
  K: 'time',
  L: 'level',
  M: "user's choice",
  N: "user's choice",
  O: "user's choice",
  P: 'pressure',
  Q: 'quantity',
  R: 'radiation',
  S: 'speed, frequency',
  T: 'temperature',
  U: 'multivariable',
  V: 'vibration',
  W: 'weight, force',
  X: 'unclassified',
  Y: 'event, state',
  Z: 'position',
}

/** what the letters after the first say it does */
export const FUNCTION_LETTERS: Record<string, string> = {
  A: 'alarm',
  C: 'control',
  D: 'differential (straight after the first letter)',
  E: 'primary element, sensor',
  F: 'ratio (straight after the first letter)',
  G: 'glass, gauge',
  H: 'high',
  I: 'indicate',
  K: 'control station',
  L: 'low, or light',
  M: 'middle',
  Q: 'integrate, totalise (straight after the first letter)',
  R: 'record',
  S: 'switch',
  T: 'transmit',
  V: 'valve, damper',
  W: 'well',
  X: 'unclassified',
  Y: 'relay, compute, convert',
  Z: 'final element, driver',
}

/** a tag's letters and its loop number: `LIC-101` is `LIC` and `101` */
export function splitTag(tag: string): { letters: string; loop: string } {
  const m = /^([A-Z]+)[- ]?(.*)$/.exec(tag)
  return m ? { letters: m[1]!, loop: m[2]! } : { letters: tag, loop: '' }
}

/** whether a tag reads as ISA-5.1: letters, an optional dash, then a loop number (`4712.02` too) */
export const isIsaTag = (tag: string) =>
  /^[A-Z]{1,5}-?\d{1,6}(\.\d{1,3})?[A-Z]?$/.test(tag)

/** the part at the far end of an instrument's signal: a controller fed by a transmitter measures what the transmitter does */
export function measuredPart(
  inst: InstrumentSpec,
  scene: Pick<Scene, 'parts' | 'instruments'>,
): Scene['parts'][number] | undefined {
  let at: InstrumentSpec | undefined = inst
  for (let hops = 0; at && hops < 8; hops++) {
    const id: string = at.measures
    const part = scene.parts.find((p) => p.id === id)
    if (part) return part
    at = scene.instruments?.find((i) => i.tag === id)
  }
  return undefined
}

/**
 * what an instrument reads when its scene doesn't say: a level its part's
 * fill, a flow its flow, a pressure, temperature or voltage its effort
 */
export function defaultReading(
  inst: InstrumentSpec,
  scene: Pick<Scene, 'parts' | 'links' | 'units' | 'instruments'>,
): { reads: string; unit: string } | undefined {
  const part = measuredPart(inst, scene)
  if (!part) return undefined
  const first = splitTag(inst.tag).letters[0]
  if (first === 'L')
    return { reads: `part('${part.id}').fill * 100`, unit: '%' }
  // pressure, temperature and voltage read the effort where it is measured
  if (
    (first === 'P' || first === 'T' || first === 'E') &&
    scene.parts.some((p) => p.effort)
  )
    return {
      reads: `part('${part.id}').effort`,
      unit: effortUnit(scene, part.id),
    }
  if (first !== 'F') return undefined
  // a flow meter reads what passes: out of a source, into anything else
  const out = part.behaviour.role === 'source'
  const link =
    scene.links.find((l) => (out ? l.from : l.to) === part.id && !l.loss) ??
    scene.links.find((l) => l.from === part.id || l.to === part.id)
  const unit = link ? (scene.units[link.domain]?.rate ?? '') : ''
  return { reads: `part('${part.id}').${out ? 'out' : 'in'}`, unit }
}

export interface Reader {
  tag: string
  unit: string
  read: Compiled
}

/** an instrument's reading, compiled; undefined for one that reads nothing */
export function compileReader(
  inst: InstrumentSpec,
  scene: Pick<Scene, 'parts' | 'links' | 'units' | 'instruments'>,
): Reader | undefined {
  const d = inst.reads === undefined ? defaultReading(inst, scene) : undefined
  const reads = inst.reads ?? d?.reads
  if (reads === undefined) return undefined
  return {
    tag: inst.tag,
    unit: inst.unit ?? d?.unit ?? '',
    read: compileExpr(reads),
  }
}

/** a tag in words: `LIC` is "level: indicate, control" */
export function describeTag(tag: string): string {
  const { letters } = splitTag(tag)
  const what = MEASURED[letters[0] ?? ''] ?? 'unknown'
  const does = [...letters.slice(1)].map((l) => FUNCTION_LETTERS[l] ?? l)
  return does.length ? `${what}: ${does.join(', ')}` : what
}

/** the unit an instrument's reading is shown in */
export function readingUnit(
  inst: InstrumentSpec,
  scene: Pick<Scene, 'parts' | 'links' | 'units' | 'instruments'>,
): string {
  return inst.unit ?? defaultReading(inst, scene)?.unit ?? ''
}
