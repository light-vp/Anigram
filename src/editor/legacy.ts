// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Domain, LinkSpec, Scene } from '../sim/types.ts'
import type { Doc } from './doc.ts'
import { routeAll } from './route.ts'
import { TEMPLATES, UNITS, makePart } from './templates.ts'
import type { ProfileId } from './templates.ts'

/*
 * The old playground saved its own format, `BuildSpec`: preset kinds, sizes
 * and links, in localStorage (`anigram.build.v1`) and in `#sheet=` links.
 * The editor now saves scene files, so those are read once, turned into the
 * same scene the playground ran, and never written again. Links people
 * shared still open.
 */

export const LEGACY_STORE = 'anigram.build.v1'
export const LEGACY_HASH_KEY = 'sheet'

export interface BuildPart {
  id: string
  kind: string
  at: [number, number]
  label?: string
  size?: number
  profile?: ProfileId
  on?: boolean
}

export interface BuildLink {
  from: string
  to: string
  domain: Domain
  bend?: 'hv' | 'vh'
}

export interface BuildSpec {
  v: 1
  title: string
  size: [number, number]
  parts: BuildPart[]
  links: BuildLink[]
}

const GRID: [number, number] = [8, 5]

const flowBetween = (from: BuildPart, to: BuildPart): Domain | null => {
  const a = TEMPLATES.get(from.kind)
  const b = TEMPLATES.get(to.kind)
  if (!a || !b) return null
  return a.gives.find((d) => b.takes.includes(d)) ?? null
}

/**
 * Anything read from a URL or storage is untrusted: keep the parts that are
 * real presets on the grid, one per cell, and the links whose ends exist and
 * can actually carry what they claim. Exactly the old playground's rules, so
 * a sheet opens as it did.
 */
export function sanitize(raw: unknown): BuildSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.parts)) return null
  const spec: BuildSpec = {
    v: 1,
    title: 'Untitled sheet',
    size: GRID,
    parts: [],
    links: [],
  }
  if (typeof r.title === 'string') spec.title = r.title.slice(0, 80)
  const seen = new Set<string>()
  const cells = new Set<string>()
  for (const p of r.parts as unknown[]) {
    if (!p || typeof p !== 'object') continue
    const q = p as Record<string, unknown>
    const t = typeof q.kind === 'string' ? TEMPLATES.get(q.kind) : undefined
    const at = q.at
    if (!t || typeof q.id !== 'string' || !Array.isArray(at)) continue
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
    // ids now have to be valid scene ids
    const id = q.id
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+/, '')
    const cell = `${c},${row}`
    if (!id || seen.has(id) || cells.has(cell)) continue
    seen.add(id)
    cells.add(cell)
    const part: BuildPart = {
      id,
      kind: t.kind,
      at: [c as number, row as number],
    }
    if (typeof q.label === 'string' && q.label.trim())
      part.label = q.label.slice(0, 40)
    if (t.size && typeof q.size === 'number' && Number.isFinite(q.size))
      part.size = Math.min(t.size.max, Math.max(0, q.size))
    if (
      typeof q.profile === 'string' &&
      t.profiles?.includes(q.profile as ProfileId)
    )
      part.profile = q.profile as ProfileId
    if (t.switch && typeof q.on === 'boolean') part.on = q.on
    spec.parts.push(part)
  }
  const idOf = (v: unknown) =>
    typeof v === 'string'
      ? v
          .slice(0, 40)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+/, '')
      : ''
  if (Array.isArray(r.links)) {
    for (const l of r.links as unknown[]) {
      if (!l || typeof l !== 'object') continue
      const q = l as Record<string, unknown>
      const from = spec.parts.find((p) => p.id === idOf(q.from))
      const to = spec.parts.find((p) => p.id === idOf(q.to))
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

/** a `#sheet=` link's payload: base64url JSON */
export function decodeSheet(text: string): BuildSpec | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

/** the scene the old playground would have run for this sheet */
export function fromBuildSpec(spec: BuildSpec): Doc {
  const made = spec.parts.map((p) =>
    makePart(TEMPLATES.get(p.kind)!, {
      id: p.id,
      at: p.at,
      label: p.label,
      size: p.size,
      profile: p.profile,
      on: p.on,
    }),
  )
  const parts = made.map((m) => m.part)
  const routes = routeAll({ size: spec.size, parts, links: spec.links })
  const links: LinkSpec[] = spec.links.map((l, i) => ({
    from: l.from,
    to: l.to,
    domain: l.domain,
    ...routes[i],
  }))

  // a link draws at full width at the biggest number anything on it is sized to
  const scale: Partial<Record<Domain, number>> = {}
  for (const p of spec.parts) {
    const t = TEMPLATES.get(p.kind)!
    if (!t.size || t.group === 'store') continue
    for (const d of [...t.gives, ...t.takes])
      scale[d] = Math.max(scale[d] ?? 0, p.size ?? t.size.value)
  }
  const used = new Set(spec.links.map((l) => l.domain))
  const units: Scene['units'] = {}
  const kept: Scene['scale'] = {}
  for (const d of used) {
    units[d] = UNITS[d]
    kept[d] = Math.max(scale[d] ?? 1, 1)
  }

  const doc: Doc = {
    id: 'playground',
    title: spec.title || 'Untitled sheet',
    subtitle: 'Built in the Anigram editor',
    sheet: 'LD-000',
    size: spec.size,
    units,
    scale: kept,
    parts,
    links,
    clock: { start: 6, rate: 0.6 },
  }
  const switches = made.flatMap((m) => (m.switch ? [m.switch] : []))
  if (switches.length) doc.switches = switches
  return doc
}
