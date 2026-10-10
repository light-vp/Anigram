// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Domain, LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import { PRESETS, PROFILES, UNITS } from './presets.ts'
import type { ProfileId } from './presets.ts'

/*
 * A sheet someone built in the playground. Unlike a curated scene it is plain
 * JSON — preset kinds, sizes and links, no functions — so it fits in a URL,
 * survives a reload, and is the same thing a coding assistant would write.
 * `toScene` turns it into a Scene the solver and the sheet already know.
 */

export interface BuildPart {
  id: string
  /** a preset kind — see presets.ts */
  kind: string
  at: [number, number]
  label?: string
  size?: number
  profile?: ProfileId
  /** for a part with a switch */
  on?: boolean
}

export interface BuildLink {
  from: string
  to: string
  domain: Domain
  /** pin the corner; left out, the link finds its own way */
  bend?: 'hv' | 'vh'
}

export interface BuildSpec {
  v: 1
  title: string
  /** columns × rows */
  size: [number, number]
  parts: BuildPart[]
  links: BuildLink[]
}

export const GRID: [number, number] = [8, 5]

export function blank(): BuildSpec {
  return { v: 1, title: 'Untitled sheet', size: GRID, parts: [], links: [] }
}

const has = <T>(list: readonly T[], x: T) => list.includes(x)

export function sizeOf(part: BuildPart): number {
  const preset = PRESETS.get(part.kind)
  return part.size ?? preset?.size?.value ?? 0
}

export function labelOf(part: BuildPart): string {
  return part.label?.trim() || PRESETS.get(part.kind)?.name || part.kind
}

export function partAt(spec: BuildSpec, [c, r]: [number, number]) {
  return spec.parts.find((p) => p.at[0] === c && p.at[1] === r)
}

/** a fresh id for a new part of this kind: battery, battery-2, … */
export function nextId(spec: BuildSpec, kind: string): string {
  if (!spec.parts.some((p) => p.id === kind)) return kind
  for (let n = 2; ; n++) {
    const id = `${kind}-${n}`
    if (!spec.parts.some((p) => p.id === id)) return id
  }
}

/**
 * What would flow from one part to another, if anything — the first thing the
 * first gives that the second takes.
 */
export function flowBetween(from: BuildPart, to: BuildPart): Domain | null {
  const a = PRESETS.get(from.kind)
  const b = PRESETS.get(to.kind)
  if (!a || !b) return null
  return a.gives.find((d) => has(b.takes, d)) ?? null
}

/**
 * Link two parts. A store or a grid connection wired to a junction gets the
 * return link too, so it can both charge and discharge.
 */
export function connect(
  spec: BuildSpec,
  fromId: string,
  toId: string,
): { spec: BuildSpec } | { error: string } {
  const from = spec.parts.find((p) => p.id === fromId)
  const to = spec.parts.find((p) => p.id === toId)
  if (!from || !to || from === to) return { error: 'Pick two different parts.' }
  const domain = flowBetween(from, to)
  if (!domain) {
    const a = PRESETS.get(from.kind)!
    const b = PRESETS.get(to.kind)!
    const gives = a.gives.length ? a.gives.join(' or ') : 'nothing on'
    const takes = b.takes.length ? b.takes.join(' or ') : 'nothing in'
    return {
      error: `${labelOf(from)} gives ${gives}; ${labelOf(to)} takes ${takes}. Nothing can flow between them.`,
    }
  }
  const exists = (f: string, t: string) =>
    spec.links.some((l) => l.from === f && l.to === t)
  if (exists(fromId, toId)) return { error: 'Those two are already linked.' }

  const links = [...spec.links, { from: fromId, to: toId, domain }]
  const store = (p: BuildPart) =>
    PRESETS.get(p.kind)!.behaviour(dialFor(p)).role === 'storage'
  const junction = (p: BuildPart) =>
    PRESETS.get(p.kind)!.behaviour(dialFor(p)).role === 'bus'
  if (
    ((store(from) && junction(to)) || (junction(from) && store(to))) &&
    flowBetween(to, from) === domain &&
    !exists(toId, fromId)
  )
    links.push({ from: toId, to: fromId, domain })
  return { spec: { ...spec, links } }
}

/** drop a part and everything wired to it */
export function removePart(spec: BuildSpec, id: string): BuildSpec {
  return {
    ...spec,
    parts: spec.parts.filter((p) => p.id !== id),
    links: spec.links.filter((l) => l.from !== id && l.to !== id),
  }
}

/** drop a link, and its return link if it has one */
export function removeLink(spec: BuildSpec, link: BuildLink): BuildSpec {
  return {
    ...spec,
    links: spec.links.filter(
      (l) =>
        !(l.from === link.from && l.to === link.to) &&
        !(l.from === link.to && l.to === link.from),
    ),
  }
}

function dialFor(part: BuildPart) {
  const preset = PRESETS.get(part.kind)!
  const profile = PROFILES[part.profile ?? preset.profiles?.[0] ?? 'flat']
  return {
    size: sizeOf(part),
    shape: (e: { hour: number; day: number }) => profile.at(e.hour, e.day),
    on: (e: { on: (id: string) => boolean }) => e.on(part.id),
  }
}

// ---------------------------------------------------------------- routing

type Pt = [number, number]

/**
 * Pick a path for each link that doesn't run through other parts or along
 * links already drawn: straight if it can, otherwise whichever elbow — or a
 * dogleg half a cell to one side — crosses the least.
 */
function route(spec: BuildSpec): Array<Pick<LinkSpec, 'via' | 'bend'>> {
  const drawn: Pt[][] = []
  return spec.links.map((link) => {
    const a = spec.parts.find((p) => p.id === link.from)!.at
    const b = spec.parts.find((p) => p.id === link.to)!.at
    // a return link follows its twin exactly; the sheet sets them side by side
    const twin = spec.links.findIndex(
      (l) => l.from === link.to && l.to === link.from,
    )
    const candidates: Array<{
      pts: Pt[]
      out: Pick<LinkSpec, 'via' | 'bend'>
    }> = []
    const add = (via: Pt[] | null, bend?: 'hv' | 'vh') => {
      const corner: Pt[] =
        via ?? (bend === 'vh' ? [[a[0], b[1]]] : [[b[0], a[1]]])
      candidates.push({
        pts: [a, ...corner, b],
        out: via ? { via } : { bend: bend ?? 'hv' },
      })
    }
    if (link.bend) add(null, link.bend)
    else if (a[0] === b[0] || a[1] === b[1]) {
      candidates.push({ pts: [a, b], out: {} })
      for (const o of [0.5, -0.5]) {
        if (a[1] === b[1])
          add([
            [a[0], a[1] + o],
            [b[0], b[1] + o],
          ])
        else
          add([
            [a[0] + o, a[1]],
            [b[0] + o, b[1]],
          ])
      }
    } else {
      add(null, 'hv')
      add(null, 'vh')
      for (const o of [0.5, -0.5]) {
        add([
          [a[0], a[1] + o],
          [b[0], a[1] + o],
        ])
        add([
          [a[0] + o, a[1]],
          [a[0] + o, b[1]],
        ])
      }
    }
    if (twin >= 0 && twin < drawn.length && !link.bend) {
      const prev = drawn[twin]!
      const back = [...prev].reverse()
      const via = back.slice(1, -1)
      drawn.push(back)
      return via.length === 0
        ? {}
        : via.length === 1 && !isHalf(via[0]!)
          ? { bend: via[0]![0] === a[0] ? 'vh' : 'hv' }
          : { via }
    }
    let best = candidates[0]!
    let bestCost = Infinity
    for (const c of candidates) {
      const cost = costOf(c.pts, spec, link, drawn) + c.pts.length * 0.5
      if (cost < bestCost - 1e-9) {
        best = c
        bestCost = cost
      }
    }
    drawn.push(best.pts)
    return best.out
  })
}

const isHalf = ([c, r]: Pt) => c % 1 !== 0 || r % 1 !== 0

function costOf(
  pts: Pt[],
  spec: BuildSpec,
  link: BuildLink,
  drawn: Pt[][],
): number {
  let cost = 0
  const step = 0.25
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.max(1, Math.round(len / step))
    for (let k = 0; k <= n; k++) {
      const x = x1 + ((x2 - x1) * k) / n
      const y = y1 + ((y2 - y1) * k) / n
      for (const p of spec.parts) {
        if (p.id === link.from || p.id === link.to) continue
        if (Math.abs(p.at[0] - x) < 0.35 && Math.abs(p.at[1] - y) < 0.35)
          cost += 4
      }
      // off the sheet
      if (
        x < -0.45 ||
        y < -0.45 ||
        x > spec.size[0] - 0.55 ||
        y > spec.size[1] - 0.55
      )
        cost += 6
      for (const other of drawn) if (onPath(other, x, y)) cost += 0.6
    }
  }
  return cost
}

function onPath(pts: Pt[], x: number, y: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    if (
      x1 === x2 &&
      Math.abs(x - x1) < 0.05 &&
      y > Math.min(y1, y2) + 0.3 &&
      y < Math.max(y1, y2) - 0.3
    )
      return true
    if (
      y1 === y2 &&
      Math.abs(y - y1) < 0.05 &&
      x > Math.min(x1, x2) + 0.3 &&
      x < Math.max(x1, x2) - 0.3
    )
      return true
  }
  return false
}

// ---------------------------------------------------------------- to a scene

export function toScene(spec: BuildSpec): Scene {
  const parts: PartSpec[] = spec.parts.map((p) => {
    const preset = PRESETS.get(p.kind)!
    return {
      id: p.id,
      kind: p.kind,
      label: labelOf(p),
      at: p.at,
      behaviour: preset.behaviour(dialFor(p)),
      note: preset.note,
      toggles: preset.switch ? p.id : undefined,
    }
  })
  const routes = route(spec)
  const links: LinkSpec[] = spec.links.map((l, i) => ({
    from: l.from,
    to: l.to,
    domain: l.domain,
    ...routes[i],
  }))

  // a link draws at full width at the biggest number anything on it is sized to
  const scale: Partial<Record<Domain, number>> = {}
  for (const p of spec.parts) {
    const preset = PRESETS.get(p.kind)!
    if (!preset.size || preset.group === 'store') continue
    for (const d of [...preset.gives, ...preset.takes])
      scale[d] = Math.max(scale[d] ?? 0, sizeOf(p))
  }
  const used = new Set(spec.links.map((l) => l.domain))
  const units: Scene['units'] = {}
  for (const d of used) {
    units[d] = UNITS[d]
    scale[d] = Math.max(scale[d] ?? 1, 1)
  }

  return {
    id: 'playground',
    title: spec.title || 'Untitled sheet',
    subtitle: 'Built in the Anigram playground',
    sheet: 'LD-000',
    size: spec.size,
    units,
    scale,
    parts,
    links,
    switches: spec.parts
      .filter((p) => PRESETS.get(p.kind)?.switch)
      .map((p) => ({
        id: p.id,
        label: labelOf(p),
        on: p.on ?? PRESETS.get(p.kind)!.switch!.start,
      })),
    clock: { start: 6, rate: 0.6 },
  }
}

// ---------------------------------------------------------------- sharing

/**
 * Anything read from a URL or storage is untrusted: keep the parts that are
 * real presets on the grid, one per cell, and the links whose ends exist and
 * can actually carry what they claim.
 */
export function sanitize(raw: unknown): BuildSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.parts)) return null
  const spec = blank()
  if (typeof r.title === 'string') spec.title = r.title.slice(0, 80)
  const seen = new Set<string>()
  const cells = new Set<string>()
  for (const p of r.parts as unknown[]) {
    if (!p || typeof p !== 'object') continue
    const q = p as Record<string, unknown>
    const preset = typeof q.kind === 'string' ? PRESETS.get(q.kind) : undefined
    const at = q.at
    if (!preset || typeof q.id !== 'string' || !Array.isArray(at)) continue
    const [c, row] = at as unknown[]
    if (
      !Number.isInteger(c) ||
      !Number.isInteger(row) ||
      (c as number) < 0 ||
      (row as number) < 0 ||
      (c as number) >= spec.size[0] ||
      (row as number) >= spec.size[1]
    )
      continue
    const id = q.id.slice(0, 40)
    const cell = `${c},${row}`
    if (seen.has(id) || cells.has(cell)) continue
    seen.add(id)
    cells.add(cell)
    const part: BuildPart = {
      id,
      kind: preset.kind,
      at: [c as number, row as number],
    }
    if (typeof q.label === 'string' && q.label.trim())
      part.label = q.label.slice(0, 40)
    if (preset.size && typeof q.size === 'number' && Number.isFinite(q.size))
      part.size = Math.min(preset.size.max, Math.max(0, q.size))
    if (
      typeof q.profile === 'string' &&
      preset.profiles?.includes(q.profile as ProfileId)
    )
      part.profile = q.profile as ProfileId
    if (preset.switch && typeof q.on === 'boolean') part.on = q.on
    spec.parts.push(part)
  }
  if (Array.isArray(r.links)) {
    for (const l of r.links as unknown[]) {
      if (!l || typeof l !== 'object') continue
      const q = l as Record<string, unknown>
      const from = spec.parts.find((p) => p.id === q.from)
      const to = spec.parts.find((p) => p.id === q.to)
      if (!from || !to || from === to) continue
      const domain = flowBetween(from, to)
      if (!domain || domain !== q.domain) continue
      if (spec.links.some((x) => x.from === from.id && x.to === to.id)) continue
      const link: BuildLink = { from: from.id, to: to.id, domain }
      if (q.bend === 'hv' || q.bend === 'vh') link.bend = q.bend
      spec.links.push(link)
    }
  }
  return spec
}

/** the spec as a URL-safe string, for `#sheet=` */
export function encode(spec: BuildSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode(text: string): BuildSpec | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}
