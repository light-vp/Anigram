// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { splitTag } from '../sim/instruments.ts'
import type { DrawingType, PartSpec, Scene } from '../sim/types.ts'
import { PACKS, classOf, shownParts, shows } from './catalogue.ts'
import { lineOf } from '../view/lines.ts'

/*
 * A drawing practice's house rules, checked. The validator says whether a
 * scene runs and the physics checks whether it could exist; these say
 * whether an engineer would accept the sheet: every item tagged in the
 * practice's scheme, lines numbered, loops closed, feeders protected, the
 * title block filled. They advise, each with its fix; `strict` (for CI and
 * print-ready sheets) is the caller's to turn into a failure.
 */

export interface DrawingFinding {
  /** which rule, from DRAWING_RULES */
  rule: string
  /** what it is about, in the validator's path shape */
  path: string
  /** what is wrong and how to fix it */
  message: string
}

/** every rule, per practice, for the guide */
export const DRAWING_RULES: Record<
  string,
  { practices: DrawingType[]; says: string }
> = {
  'title-block': {
    practices: ['pid', 'single-line', 'pfd'],
    says: 'the title block names the owner, who drew it, the issue date, revision and status, and the sheet has a drawing number',
  },
  'equipment-tag': {
    practices: ['pid', 'single-line', 'pfd'],
    says: 'every piece of equipment on the sheet has a tag',
  },
  'tag-letter': {
    practices: ['pid', 'single-line', 'pfd'],
    says: 'a tag starts with the letter code for what the part is (P pump, T tank, E exchanger on a P&ID; -Q switch, -T transformer, -G generator in IEC 81346)',
  },
  'line-number': {
    practices: ['pid', 'pfd'],
    says: 'each process line (P&ID) or stream (PFD) is numbered, and no two share a number',
  },
  'control-loop': {
    practices: ['pid'],
    says: 'a control valve is driven by a controller, and the instruments of a loop share its number',
  },
  'measured-variable': {
    practices: ['pid'],
    says: "an instrument's first letter matches what its part can give: a level from a tank or vessel",
  },
  protection: {
    practices: ['single-line'],
    says: 'a load, motor or generator joins a busbar through a breaker, disconnector or fuse',
  },
}

/** the letter codes each class's tag may start with */
const PID_LETTERS: Record<string, string[]> = {
  CentrifugalPump: ['P'],
  PositiveDisplacementPump: ['P'],
  Compressor: ['C', 'K'],
  Fan: ['F', 'K', 'B'],
  Tank: ['T', 'TK'],
  Vessel: ['V', 'D', 'TK', 'T'],
  HeatExchanger: ['E', 'H', 'B'],
  Filter: ['F', 'S'],
  GateValve: ['V', 'HV', 'XV'],
  GlobeValve: ['V', 'HV', 'XV'],
  BallValve: ['V', 'HV', 'XV'],
  CheckValve: ['V', 'CV'],
  ElectricMotor: ['M', 'PM'],
  Turbine: ['T', 'ST', 'GT', 'HT'],
}
/** IEC 81346-2 class letters, first letter of the code */
const IEC_LETTERS: Record<string, string[]> = {
  Grid: ['X', 'W', 'G'],
  Generator: ['G'],
  Transformer: ['T'],
  CircuitBreaker: ['Q'],
  Disconnector: ['Q'],
  Fuse: ['F', 'Q'],
  Battery: ['G'],
  PhotovoltaicArray: ['G'],
  Inverter: ['T'],
  Motor: ['M'],
  Load: ['E', 'M', 'W', 'X', 'P', 'C', 'R'],
  Busbar: ['W'],
  Cable: ['W'],
}

/** classes that are not equipment, so carry no tag of their own */
const UNTAGGED = new Set(['OffPageConnector', 'Junction', 'Cable'])
const SWITCHING = new Set(['CircuitBreaker', 'Disconnector', 'Fuse'])
const UNPROTECTED = new Set(['Load', 'Motor', 'Generator'])

/** a P&ID line number: size, fluid code, sequence, like `100-W-001` */
const LINE_NUMBER = /^\d+(\.\d+)?"?-[A-Z]{1,4}-\d+[A-Z]?(-[A-Z0-9]+)*$/

/** the letters of an IEC 81346 reference designation's last product aspect: `=A1-QA2` is `QA` */
const iecLetters = (tag: string) => /-([A-Z]+)\d*$/.exec(tag)?.[1]

const isaLoop = (tag: string | undefined) =>
  tag && /^[A-Z]{1,5}-?\d/.test(tag) ? splitTag(tag).loop : undefined

export function drawingFindings(scene: Scene): DrawingFinding[] {
  const drawing = scene.drawing
  const pack = drawing ? PACKS[drawing] : undefined
  if (!drawing || !pack) return []
  const out: DrawingFinding[] = []
  const find = (rule: string, path: string, message: string) =>
    out.push({ rule, path, message })
  const shown = shownParts(scene)
  const parts = scene.parts.filter((p) => shown.has(p.id))
  const byId = new Map(scene.parts.map((p) => [p.id, p]))
  const cls = (p: PartSpec | undefined) => (p ? classOf(p, scene) : undefined)
  const name = (p: PartSpec) => p.tag ?? p.label
  /** the next number not yet used after a prefix, among these tags */
  const next = (tags: Array<string | undefined>, re: RegExp) =>
    Math.max(0, ...tags.map((t) => Number(re.exec(t ?? '')?.[1] ?? 0))) + 1

  // title block
  const tb = scene.titleBlock ?? {}
  const missing = (
    [
      ['owner', 'owner'],
      ['drawnBy', 'drawn by'],
      ['issued', 'issue date'],
      ['revision', 'revision'],
      ['status', 'status'],
    ] as const
  ).filter(([k]) => !tb[k])
  if (missing.length)
    find(
      'title-block',
      'titleBlock',
      `the title block has no ${missing.map(([, w]) => w).join(', ')}; fill in ${missing.map(([k]) => `"${k}"`).join(', ')}`,
    )
  // LD-100 is what the validator fills in when a scene names no sheet
  if (!scene.sheet || scene.sheet === 'LD-100')
    find(
      'title-block',
      'sheet',
      `the sheet has no drawing number; set "sheet", e.g. "${drawing === 'pid' ? 'PID' : drawing === 'pfd' ? 'PFD' : 'SLD'}-001"`,
    )

  // tags
  const ansi = drawing === 'single-line' && scene.symbols === 'ansi'
  const letters = drawing === 'single-line' ? IEC_LETTERS : PID_LETTERS
  const partTags = scene.parts.map((p) => p.tag)
  for (const p of parts) {
    const c = cls(p)
    if (c && UNTAGGED.has(c)) continue
    const path = `parts (${p.id})`
    if (!p.tag) {
      const want = c ? letters[c]?.[0] : undefined
      // suggest the next free number for that letter, counting earlier suggestions
      const tag =
        want &&
        (drawing === 'single-line'
          ? `-${want}${next(partTags, new RegExp(`-${want}(\\d+)$`))}`
          : `${want}-${100 + next(partTags, new RegExp(`^${want}-1(\\d\\d)$`))}`)
      if (tag) partTags.push(tag)
      find(
        'equipment-tag',
        path,
        `${p.label} has no tag; give it one${tag ? `, e.g. "${tag}"` : ''}`,
      )
      continue
    }
    if (ansi || !c) continue
    const allowed = letters[c]
    if (c === 'ControlValve') {
      // a control valve is tagged as its loop's final element: LV-101, FV-102
      if (!/^[A-Z]{1,3}V-?\d/.test(p.tag))
        find(
          'tag-letter',
          `${path}.tag`,
          `${p.tag} is a control valve, which is tagged by its loop: the measured letter then V, like "LV-101" for the valve a level controller works`,
        )
      continue
    }
    if (!allowed) continue
    const got =
      drawing === 'single-line' ? iecLetters(p.tag) : splitTag(p.tag).letters
    const ok =
      got !== undefined &&
      (drawing === 'single-line'
        ? allowed.includes(got[0]!)
        : allowed.includes(got))
    if (!ok)
      find(
        'tag-letter',
        `${path}.tag`,
        drawing === 'single-line'
          ? `${p.tag}: IEC 81346 tags a ${pack.classes[c]!.is.replace(/^an? /, '').split(';')[0]} with ${allowed.map((l) => `-${l}`).join(' or ')}, like "-${allowed[0]}1"`
          : `${p.tag}: a ${c} is usually tagged ${allowed.join(' or ')}, like "${allowed[0]}-101"`,
      )
  }

  // line numbers and stream numbers
  if (drawing === 'pid' || drawing === 'pfd') {
    const seen = new Map<string, number>()
    const tags = scene.links.map((l) => l.tag)
    const suggest = (t: string) => (tags.push(t), t)
    scene.links.forEach((l, i) => {
      if (!shows(l, scene) || l.loss) return
      const kind = lineOf(l)
      if (kind !== 'process' && kind !== 'utility') return
      const path = `links[${i}] (${l.from} → ${l.to})`
      const ends = `${name(byId.get(l.from)!)} to ${name(byId.get(l.to)!)}`
      // a line keeps its number through a valve set in it
      const carried = [l.from, l.to].some((id) => {
        const c = cls(byId.get(id))
        return (
          c &&
          pack.classes[c]?.inline &&
          scene.links.some(
            (o) => o !== l && o.tag && (o.from === id || o.to === id),
          )
        )
      })
      if (!l.tag && carried) return
      if (!l.tag) {
        find(
          'line-number',
          path,
          drawing === 'pid'
            ? `the line from ${ends} has no number; give it a "tag" of size, fluid and sequence, like "${suggest(`100-W-${String(next(tags, /-(\d+)[A-Z]?$/)).padStart(3, '0')}`)}"`
            : `the stream from ${ends} has no number; give it a "tag", like "${suggest(String(next(tags, /^(\d+)$/)))}"`,
        )
        return
      }
      if (seen.has(l.tag))
        find(
          'line-number',
          `${path}.tag`,
          `${l.tag} is also the number of links[${seen.get(l.tag)}]; each line gets its own`,
        )
      else seen.set(l.tag, i)
      if (drawing === 'pid' && !LINE_NUMBER.test(l.tag))
        find(
          'line-number',
          `${path}.tag`,
          `${l.tag} doesn't read as a line number: size, fluid code and sequence, like "100-W-001"`,
        )
    })
  }

  // control loops
  if (drawing === 'pid') {
    const instruments = scene.instruments ?? []
    for (const p of parts) {
      if (cls(p) !== 'ControlValve') continue
      if (!instruments.some((x) => x.drives === p.id))
        find(
          'control-loop',
          `parts (${p.id})`,
          `${name(p)} is a control valve but no controller drives it; add an instrument such as "LIC-101" with "drives": "${p.id}"`,
        )
    }
    instruments.forEach((x, i) => {
      const path = `instruments[${i}] (${x.tag})`
      const loop = splitTag(x.tag).loop
      const fed = instruments.find((o) => o.tag === x.measures)
      if (fed && splitTag(fed.tag).loop !== loop)
        find(
          'control-loop',
          path,
          `${x.tag} works on ${fed.tag}, so they are one loop and share its number: ${splitTag(x.tag).letters}-${splitTag(fed.tag).loop}`,
        )
      const driven = x.drives ? byId.get(x.drives) : undefined
      const dl = isaLoop(driven?.tag)
      if (driven && dl !== undefined && dl !== loop)
        find(
          'control-loop',
          path,
          `${x.tag} drives ${driven.tag}, which carries loop ${dl}; tag the valve ${splitTag(driven.tag!).letters}-${loop} or the controller ${splitTag(x.tag).letters}-${dl}`,
        )
      if (!fed && splitTag(x.tag).letters[0] === 'L') {
        const p = byId.get(x.measures)
        const c = cls(p)
        if (
          p &&
          c !== 'Tank' &&
          c !== 'Vessel' &&
          p.behaviour.role !== 'storage'
        )
          find(
            'measured-variable',
            path,
            `${x.tag} measures a level, but ${name(p)} holds nothing to have one; point it at a tank or vessel, or pick the letter for what it measures (F flow, P pressure, T temperature)`,
          )
      }
    })
  }

  // protection
  if (drawing === 'single-line') {
    scene.links.forEach((l, i) => {
      if (!shows(l, scene)) return
      const a = byId.get(l.from)
      const b = byId.get(l.to)
      const ca = cls(a)
      const cb = cls(b)
      const [bar, other] =
        ca === 'Busbar' ? [a, b] : cb === 'Busbar' ? [b, a] : []
      if (!bar || !other) return
      const co = cls(other)
      if (!co || !UNPROTECTED.has(co) || SWITCHING.has(co)) return
      const q = `-Q${next(partTags, /-Q[A-Z]?(\d+)$/)}`
      partTags.push(q)
      find(
        'protection',
        `links[${i}] (${l.from} → ${l.to})`,
        `${name(other)} joins ${name(bar)} with no breaker; put a CircuitBreaker (or a Fuse) between them, like "${q}"`,
      )
    })
  }

  return out
}
