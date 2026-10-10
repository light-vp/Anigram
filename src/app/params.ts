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
 *   ?build=1                         the playground: build your own sheet
 *   ?embed=build                     the playground without its header
 *   ?screen=1                        a wall screen: dark, full bleed, tours every sheet
 *   ?theme=light|dark                the sheet's palette (old names: paper, blueprint)
 *   ?mode=paper                      frozen and annotated, ready to print
 *   ?t=18.5                          start the clock at 18:30
 *   ?speed=2                         clock multiplier
 */

export type View =
  'app' | 'app-embed' | 'build' | 'build-embed' | 'embed' | 'screen'

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
}

export function readParams(search = window.location.search): Params {
  const q = new URLSearchParams(search)
  const embed = q.get('embed')
  let view: View = 'app'
  if (q.has('screen')) view = 'screen'
  else if (embed === 'build') view = 'build-embed'
  else if (q.has('build')) view = 'build'
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
    theme: THEME_ALIASES[theme ?? ''] ?? null,
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
