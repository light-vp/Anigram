// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { THEME_NAMES } from '../view/palette.ts'
import type { ThemeId } from '../view/palette.ts'
import type { View } from './params.ts'

/*
 * Which colours a page opens in. A theme in the link wins; then the one the
 * reader last picked here; then the view's own: an embed sits on someone
 * else's page, so it stays plain white, a wall screen glows at night, and
 * everything else is the sketchbook.
 */

const KEY = 'anigram.theme'
const EMBEDS: View[] = ['embed', 'app-embed', 'build-embed']

const isTheme = (t: string | null): t is ThemeId => !!t && t in THEME_NAMES

export function openingTheme(view: View, asked: ThemeId | null): ThemeId {
  if (asked) return asked
  if (EMBEDS.includes(view)) return 'light'
  const saved = readSaved()
  if (saved) return saved
  return view === 'screen' ? 'night' : 'sketchbook'
}

/** remember a theme the reader picked, for the next page they open */
export function saveTheme(view: View, theme: ThemeId) {
  if (EMBEDS.includes(view)) return
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // private windows and blocked storage just don't remember
  }
}

function readSaved(): ThemeId | null {
  try {
    const t = localStorage.getItem(KEY)
    return isTheme(t) ? t : null
  } catch {
    return null
  }
}
