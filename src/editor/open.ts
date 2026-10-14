// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { FORMAT_VERSION, stamp } from '../format/migrate.ts'
import { HASH_KEY, decodeScene, encodeScene } from '../format/share.ts'
import { validateScene } from '../format/validate.ts'
import { STARTERS as PRACTICE_STARTERS } from '../packs/starters.ts'
import { SCENES } from '../scenes/index.ts'
import type { DrawingType } from '../sim/types.ts'
import type { Doc } from './doc.ts'
import {
  LEGACY_HASH_KEY,
  LEGACY_STORE,
  decodeSheet,
  fromBuildSpec,
  sanitize,
} from './legacy.ts'
import { PICTORIAL_STARTERS } from './starters.ts'

/*
 * What the editor opens, and where it keeps it. It opens anything the app
 * can show: a shared link, a built-in sheet, a file, an assistant's scene,
 * the sheet you left last time, or a starter. Whatever it opens it checks
 * the way the app does, and refuses a file that wouldn't run rather than
 * opening it half-broken.
 */

/** where the sheet you're working on is kept between visits */
export const STORE = 'anigram.editor.v1'

export type OpenedFrom =
  'link' | 'old-link' | 'built-in' | 'file' | 'saved' | 'old-save' | 'starter'

export interface Opened {
  doc: Doc
  from: OpenedFrom
  /** why something asked for couldn't be opened, so a starter was */
  problem?: string
}

export interface Starter {
  id: string
  label: string
  doc: () => Doc
}

const copy = <T>(x: T): T => structuredClone(x)

/** everything the "start from" menu offers */
export const STARTERS: Starter[] = [
  ...PICTORIAL_STARTERS.map((d) => ({
    id: d.id,
    label: d.title,
    doc: () => copy(d),
  })),
  ...(['pid', 'single-line', 'pfd', 'fluid-power'] as DrawingType[]).map(
    (k) => ({
      id: `${k}-starter`,
      label: {
        pid: 'A P&ID',
        'single-line': 'A single-line',
        pfd: 'A PFD',
        'fluid-power': 'A hydraulic circuit',
      }[k as 'pid'],
      doc: () => copy(PRACTICE_STARTERS[k] as unknown as Doc),
    }),
  ),
  ...SCENES.map((s) => ({
    id: s.id,
    label: s.title,
    doc: () => builtIn(s.id)!,
  })),
  {
    id: 'blank',
    label: 'A blank sheet',
    doc: () => blank(),
  },
]

export function blank(drawing?: DrawingType): Doc {
  const doc: Doc = {
    anigram: 1,
    id: 'untitled',
    title: 'Untitled sheet',
    size: [8, 5],
    parts: [],
    links: [],
  }
  if (drawing && drawing !== 'pictorial') doc.drawing = drawing
  return doc
}

/** a built-in sheet as a file, ready to edit */
export function builtIn(id: string): Doc | undefined {
  const s = SCENES.find((x) => x.id === id)
  return s ? (stamp(copy(s)) as Doc) : undefined
}

/**
 * Check a scene from outside (a file, a link, storage) the way the app does.
 * The file itself is kept as it is, not the validator's normalised copy, so
 * saving it changes only what was edited.
 */
export function accept(raw: unknown): { doc?: Doc; errors: string[] } {
  const v = validateScene(raw)
  if (!v.scene) return { errors: v.errors }
  return { doc: raw as Doc, errors: [] }
}

const describe = (what: string, errors: string[]) =>
  `That ${what} has ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.slice(0, 3).join('; ')}`

/** what to open, from the address and what this browser kept */
export async function initialDoc(
  url: { search: string; hash: string },
  storage: Pick<Storage, 'getItem'> | null,
): Promise<Opened> {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = new URLSearchParams(url.search)
  let problem: string | undefined

  const encoded = hash.get(HASH_KEY)
  if (encoded) {
    try {
      const got = accept(await decodeScene(encoded))
      if (got.doc) return { doc: got.doc, from: 'link' }
      problem = describe('scene link', got.errors)
    } catch {
      problem = 'That scene link is damaged; it may have been cut short.'
    }
  }

  const sheet = hash.get(LEGACY_HASH_KEY)
  if (sheet && !problem) {
    const spec = decodeSheet(sheet)
    if (spec) return { doc: fromBuildSpec(spec), from: 'old-link' }
    problem = 'That playground link is damaged; it may have been cut short.'
  }

  const id = query.get('scene')
  if (id && !problem) {
    const doc = builtIn(id)
    if (doc) return { doc, from: 'built-in' }
    const starter = STARTERS.find((s) => s.id === id)
    if (starter) return { doc: starter.doc(), from: 'starter' }
  }

  const read = (key: string) => {
    try {
      const text = storage?.getItem(key)
      return text ? (JSON.parse(text) as unknown) : null
    } catch {
      // storage blocked or garbled: carry on as if it were empty
      return null
    }
  }
  const saved = read(STORE)
  if (saved) {
    const got = accept(saved)
    if (got.doc) return { doc: got.doc, from: 'saved', problem }
  }
  const old = read(LEGACY_STORE)
  const spec = old ? sanitize(old) : null
  if (spec) return { doc: fromBuildSpec(spec), from: 'old-save', problem }

  const drawing = query.get('drawing')
  const practice = STARTERS.find((s) => s.id === `${drawing}-starter`)
  return {
    doc: (practice ?? STARTERS[0]!).doc(),
    from: 'starter',
    problem,
  }
}

/** the file to save: stamped with the format version, everything else as it was */
export const fileOf = (doc: Doc): Doc =>
  doc.anigram === FORMAT_VERSION ? doc : stamp(doc)

/** a link that opens this sheet in the editor */
export async function editLink(
  doc: Doc,
  base: { origin: string; pathname: string },
): Promise<string> {
  return `${base.origin}${base.pathname}?build=1#${HASH_KEY}=${await encodeScene(fileOf(doc))}`
}

/** a link that shows this sheet in the app, without the editor */
export async function viewLink(
  doc: Doc,
  base: { origin: string; pathname: string },
): Promise<string> {
  return `${base.origin}${base.pathname}#${HASH_KEY}=${await encodeScene(fileOf(doc))}`
}
