// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { PartState } from '../sim/solver.ts'
import type { Domain, PartSpec, Scene } from '../sim/types.ts'

export function num(v: number): string {
  const a = Math.abs(v)
  if (a < 0.05) return '0'
  if (a < 10) return v.toFixed(1)
  return Math.round(v).toLocaleString('en-GB')
}

export function rate(scene: Scene, domain: Domain, v: number): string {
  return `${num(v)} ${scene.units[domain]?.rate ?? ''}`.trim()
}

export function amount(scene: Scene, domain: Domain, v: number): string {
  return `${num(v)} ${scene.units[domain]?.amount ?? ''}`.trim()
}

/** the domain a part mostly deals in: its first link's, or its product's */
export function partDomain(scene: Scene, part: PartSpec): Domain {
  const b = part.behaviour
  if (b.role === 'converter') return b.output
  const out = scene.links.find((l) => l.from === part.id && !l.loss)
  const into = scene.links.find((l) => l.to === part.id)
  return (out ?? into)?.domain ?? 'electric'
}

/** the inputs a part takes, by domain, from its links */
function inDomain(scene: Scene, part: PartSpec): Domain {
  return (
    scene.links.find((l) => l.to === part.id && !l.loss)?.domain ??
    partDomain(scene, part)
  )
}

export interface Readout {
  /** the short line under the label on the sheet */
  value: string
  /** true when the part is failing to do its job */
  bad: boolean
}

export function readout(scene: Scene, part: PartSpec, s: PartState): Readout {
  const b = part.behaviour
  const d = partDomain(scene, part)
  switch (b.role) {
    case 'source':
      return { value: rate(scene, d, s.out), bad: false }
    case 'sink': {
      if (s.demand <= 0)
        return {
          value: b.absorbsSurplus ? rate(scene, d, s.in) : 'off',
          bad: false,
        }
      const short = !b.absorbsSurplus && s.in < s.demand * 0.97
      return {
        value: short
          ? `${num(s.in)} of ${rate(scene, d, s.demand)}`
          : rate(scene, d, s.in),
        bad: short,
      }
    }
    case 'storage': {
      if (b.capacity >= 1e5) {
        if (s.out > s.in + 1e-6)
          return { value: `import ${rate(scene, d, s.out - s.in)}`, bad: false }
        if (s.in > s.out + 1e-6)
          return { value: `export ${rate(scene, d, s.in - s.out)}`, bad: false }
        return { value: 'idle', bad: false }
      }
      const pct = `${Math.round(s.fill * 100)}%`
      const net = s.in - s.out
      if (Math.abs(net) < 1e-6) return { value: pct, bad: s.fill < 0.02 }
      return {
        value: `${pct} ${net > 0 ? '▲' : '▼'} ${rate(scene, d, Math.abs(net))}`,
        bad: s.fill < 0.02,
      }
    }
    case 'gate':
      if (s.open < 0.01)
        return {
          value: part.kind === 'breaker' ? 'tripped' : 'shut',
          // a tripped breaker is news; a shut valve is just a valve
          bad: part.kind === 'breaker',
        }
      return { value: rate(scene, d, s.out), bad: false }
    case 'converter':
      if (s.starting) return { value: 'starting…', bad: true }
      return { value: rate(scene, d, s.out), bad: false }
    case 'bus':
      return { value: rate(scene, d, s.in), bad: false }
    case 'vent':
      return { value: rate(scene, inDomain(scene, part), s.in), bad: false }
  }
}

/** what a role means, for the inspector */
export const ROLE_NAMES: Record<PartSpec['behaviour']['role'], string> = {
  source: 'source',
  sink: 'demand',
  bus: 'junction',
  gate: 'switch',
  converter: 'converter',
  storage: 'store',
  vent: 'where losses go',
}

/** the inspector's table: label / value rows */
export function details(
  scene: Scene,
  part: PartSpec,
  s: PartState,
): Array<[string, string]> {
  const b = part.behaviour
  const d = partDomain(scene, part)
  const rows: Array<[string, string]> = []
  switch (b.role) {
    case 'source':
      rows.push(['producing', rate(scene, d, s.out)])
      if (s.avail > s.out + 1e-6) {
        rows.push([
          b.dispatchable ? 'could make' : 'going spare',
          rate(scene, d, s.avail - (b.dispatchable ? 0 : s.out)),
        ])
      }
      break
    case 'sink':
      rows.push(['wants', rate(scene, d, s.demand)])
      rows.push(['getting', rate(scene, d, s.in)])
      if (s.demand > 0)
        rows.push(['served', `${Math.round((s.in / s.demand) * 100)}%`])
      break
    case 'storage':
      if (b.capacity < 1e5) {
        rows.push([
          'holding',
          `${amount(scene, d, s.level)} of ${amount(scene, d, b.capacity)}`,
        ])
        rows.push(['level', `${Math.round(s.fill * 100)}%`])
      }
      rows.push(['in', rate(scene, d, s.in)])
      rows.push(['out', rate(scene, d, s.out)])
      break
    case 'converter': {
      for (const [dom, per] of Object.entries(b.recipe) as Array<
        [Domain, number]
      >) {
        rows.push([
          `takes`,
          `${rate(scene, dom, s.out * per)} of ${dom === 'heat' ? 'heat' : dom}`,
        ])
      }
      rows.push(['makes', rate(scene, b.output, s.out)])
      if (s.loss > 1e-6) rows.push(['loses', rate(scene, 'heat', s.loss)])
      if (s.starting) rows.push(['state', 'starting up'])
      break
    }
    case 'gate':
      rows.push([
        'state',
        s.open < 0.01 ? 'switched off' : `${Math.round(s.open * 100)}% open`,
      ])
      rows.push(['passing', rate(scene, d, s.out)])
      break
    case 'bus':
      rows.push(['through', rate(scene, d, s.in)])
      break
    case 'vent':
      rows.push(['receiving', rate(scene, inDomain(scene, part), s.in)])
      break
  }
  return rows
}
