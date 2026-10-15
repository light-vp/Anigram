// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { stamp } from '../format/migrate.ts'
import { HASH_KEY, encodeScene } from '../format/share.ts'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'

/*
 * The URL is the embed API. Every way of showing a sheet is a query string:
 *
 *   (nothing)                        the editor: Anigram's home, on the sheet you left
 *   ?examples                        the built-in sheets, running, with their dials
 *   ?docs                            how it works, the MCP server, the URL API
 *   ?scene=grid                      that sheet running (old cloud ids still resolve)
 *   ?embed=1                         just the sheet and a play bar, for an iframe
 *   ?embed=presentation&scene=…      the portfolio's existing embed — same as embed=1
 *   ?embed=app                       the full app without its header
 *   ?build=1                         the editor: build a sheet, or edit one (with ?scene= or #scene=)
 *   ?build=1&drawing=pid             the editor, starting from a P&ID (or single-line, pfd, fluid-power)
 *   ?embed=build                     the editor without its header
 *   ?screen=1                        a wall screen: dark, full bleed, tours every sheet
 *   ?theme=light|dark                the sheet's palette (old names: paper, blueprint)
 *   ?mode=paper                      frozen and annotated, ready to print
 *   ?t=18.5                          start the clock at 18:30
 *   ?speed=2                         clock multiplier
 *   ?credit=0                        leave off the "Made with Anigram" line (svg export too)
 *   ?paused=1                        open with the clock stopped (embed)
 *   ?controls=0                      leave off the play bar (embed)
 *   #scene=…                         a whole scene file, deflated (see format/share.ts); running,
 *                                    or in the editor with ?build=1
 */

export type View =
  'app' | 'app-embed' | 'build' | 'build-embed' | 'embed' | 'screen' | 'docs'

const THEME_ALIASES: Record<string, ThemeId> = {
  light: 'light',
  dark: 'dark',
  paper: 'light',
  cream: 'light',
  blueprint: 'dark',
}

export interface Params {
  view: View
  scene: string | null
  theme: ThemeId | null
  paper: boolean
  hour: number | null
  speed: number | null
  /** sign the sheet; on unless ?credit=0 */
  credit: boolean
  /** open with the clock stopped (?paused=1) */
  paused: boolean
  /** the embed's play bar; on unless ?controls=0 */
  controls: boolean
}

export function readParams(
  search = window.location.search,
  hash = window.location.hash,
): Params {
  const q = new URLSearchParams(search)
  const embed = q.get('embed')
  // a sheet named in the address runs; with nothing named, Anigram opens on the editor
  const showing =
    q.has('scene') || q.has('examples') || hash.startsWith(`#${HASH_KEY}=`)
  let view: View = 'build'
  if (q.has('screen')) view = 'screen'
  else if (embed === 'build') view = 'build-embed'
  else if (q.has('build')) view = 'build'
  else if (embed === 'app') view = 'app-embed'
  else if (embed !== null) view = 'embed'
  else if (q.has('docs')) view = 'docs'
  else if (showing) view = 'app'
  const theme = q.get('theme')
  const num = (k: string) => {
    const v = q.get(k)
    if (v === null || v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    view,
    scene: q.get('scene'),
    theme: THEME_ALIASES[theme ?? ''] ?? null,
    paper: q.get('mode') === 'paper',
    hour: num('t'),
    speed: num('speed'),
    credit: q.get('credit') !== '0',
    paused: q.has('paused') && q.get('paused') !== '0',
    controls: q.get('controls') !== '0',
  }
}

/** keep the address bar pointing at the sheet on screen, so it can be shared */
export function writeSceneParam(sceneId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('scene', sceneId)
  url.hash = ''
  window.history.replaceState(null, '', url)
}

/** the link to a scene file: the whole scene rides in the hash */
export async function sceneLink(scene: Scene): Promise<string> {
  const url = new URL(window.location.href)
  url.searchParams.delete('scene')
  url.hash = `${HASH_KEY}=${await encodeScene(stamp(scene))}`
  return url.href
}

/** an opened file becomes the address bar's scene, so reloading keeps it */
export async function writeSceneHash(scene: Scene) {
  window.history.replaceState(null, '', await sceneLink(scene))
}

/** the iframe snippet for a sheet */
export function embedSnippet(
  sceneId: string,
  title: string,
  aspect: number,
): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `<iframe src="${base}?embed=1&scene=${sceneId}" title="${title}" loading="lazy" style="width:100%;aspect-ratio:${aspect.toFixed(3)};border:0"></iframe>`
}
