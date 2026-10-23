// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { decodeScene, sceneFromHash } from '../format/share.ts'
import { validateScene } from '../format/validate.ts'
import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'
import type { Params } from '../app/params.ts'

/*
 * What a <living-diagram> element was given, read off its attributes: where
 * its scene comes from, and the same settings an ?embed=1 iframe takes from
 * its URL. React-free, so the rules are easy to read in one place.
 */

/** where the scene comes from, first match wins */
export type Source =
  | { kind: 'src'; url: string }
  | { kind: 'share'; text: string }
  | { kind: 'inline'; json: string }
  | { kind: 'scene'; id: string }
  | { kind: 'none' }

/** the attributes that pick the scene; changing one loads it again */
export const SOURCE_ATTRIBUTES = ['src', 'share', 'scene'] as const

/** the attributes that tune a running sheet */
export const VIEW_ATTRIBUTES = [
  'theme',
  'hour',
  'speed',
  'paused',
  'controls',
  'credit',
  'mode',
] as const

export type ThemeSetting = ThemeId | 'auto'

export function readSource(el: Element): Source {
  const src = el.getAttribute('src')
  if (src?.trim()) return { kind: 'src', url: src.trim() }
  const share = el.getAttribute('share')
  if (share?.trim()) return { kind: 'share', text: share.trim() }
  const script = el.querySelector(':scope > script[type="application/json"]')
  if (script?.textContent?.trim())
    return { kind: 'inline', json: script.textContent }
  const id = el.getAttribute('scene')
  if (id?.trim()) return { kind: 'scene', id: id.trim() }
  return { kind: 'none' }
}

/** `false`, `0`, `off` and `no` turn a switch off; any other value, or none, turns it on */
function flag(el: Element, name: string, fallback: boolean): boolean {
  const v = el.getAttribute(name)
  if (v === null) return fallback
  return !['false', '0', 'off', 'no'].includes(v.trim().toLowerCase())
}

function num(el: Element, name: string): number | null {
  const v = el.getAttribute(name)
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function readTheme(el: Element): ThemeSetting {
  const t = el.getAttribute('theme')?.trim().toLowerCase()
  if (t === 'dark' || t === 'blueprint') return 'dark'
  if (t === 'sketchbook' || t === 'cream') return 'sketchbook'
  if (t === 'night') return 'night'
  if (t === 'auto') return 'auto'
  return 'light'
}

/** the element's settings as the embed view's params */
export function readSettings(el: Element, theme: ThemeId): Params {
  return {
    view: 'embed',
    scene: null,
    theme,
    paper: el.getAttribute('mode')?.trim() === 'paper',
    plain: el.getAttribute('mode')?.trim() === 'static',
    hour: num(el, 'hour'),
    speed: num(el, 'speed'),
    credit: flag(el, 'credit', true),
    paused: flag(el, 'paused', false),
    controls: flag(el, 'controls', true),
  }
}

export type Loaded =
  { ok: true; scene: Scene } | { ok: false; message: string; errors: string[] }

const fail = (message: string, errors: string[] = []): Loaded => ({
  ok: false,
  message,
  errors,
})

/** the encoded scene in a share attribute: a whole link, `#scene=…`, or just the text after it */
function shareText(text: string): string {
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text
  return sceneFromHash(hash) ?? hash
}

/** fetch, parse and validate a scene; never throws */
export async function loadScene(source: Source): Promise<Loaded> {
  let raw: unknown
  switch (source.kind) {
    case 'none':
      return fail(
        'No scene given. Add src="…", scene="…", share="…" or a <script type="application/json"> child.',
      )
    case 'scene': {
      const scene = SCENES.find((s) => s.id === source.id)
      if (!scene)
        return fail(
          `There is no built-in sheet "${source.id}". The sheets are ${SCENES.map((s) => s.id).join(', ')}.`,
        )
      raw = scene
      break
    }
    case 'src': {
      let res: Response
      try {
        res = await fetch(source.url)
      } catch {
        return fail(`Couldn't fetch ${source.url}.`)
      }
      if (!res.ok)
        return fail(
          `Couldn't fetch ${source.url}: ${res.status} ${res.statusText}`.trim(),
        )
      try {
        raw = JSON.parse(await res.text())
      } catch {
        return fail(`${source.url} isn't JSON.`)
      }
      break
    }
    case 'share':
      try {
        raw = await decodeScene(shareText(source.text))
      } catch {
        return fail(
          'That share string is damaged — it may have been cut short.',
        )
      }
      break
    case 'inline':
      try {
        raw = JSON.parse(source.json)
      } catch {
        return fail("The inline scene isn't JSON.")
      }
      break
  }
  const v = validateScene(raw)
  if (!v.scene) {
    const n = v.errors.length
    return fail(`That scene has ${n} problem${n === 1 ? '' : 's'}.`, v.errors)
  }
  return { ok: true, scene: v.scene }
}
