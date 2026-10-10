// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ThemeId } from '../view/palette.ts'

/*
 * The URL is the embed API. Every way of showing a sheet is a query string:
 *
 *   ?scene=grid                      which sheet (old cloud ids still resolve)
 *   ?embed=1                         just the sheet and a play bar, for an iframe
 *   ?embed=presentation&scene=…      the portfolio's existing embed — same as embed=1
 *   ?embed=app                       the full app without its header
 *   ?screen=1                        a wall screen: blueprint, full bleed, tours every sheet
 *   ?theme=blueprint|paper           the sheet's palette
 *   ?mode=paper                      frozen and annotated, ready to print
 *   ?t=18.5                          start the clock at 18:30
 *   ?speed=2                         clock multiplier
 */

export type View = 'app' | 'app-embed' | 'embed' | 'screen'

export interface Params {
  view: View
  scene: string | null
  theme: ThemeId | null
  paper: boolean
  hour: number | null
  speed: number | null
}

export function readParams(search = window.location.search): Params {
  const q = new URLSearchParams(search)
  const embed = q.get('embed')
  let view: View = 'app'
  if (q.has('screen')) view = 'screen'
  else if (embed === 'app') view = 'app-embed'
  else if (embed !== null) view = 'embed'
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
    theme: theme === 'blueprint' || theme === 'paper' ? theme : null,
    paper: q.get('mode') === 'paper',
    hour: num('t'),
    speed: num('speed'),
  }
}

/** keep the address bar pointing at the sheet on screen, so it can be shared */
export function writeSceneParam(sceneId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('scene', sceneId)
  window.history.replaceState(null, '', url)
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
