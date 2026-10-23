// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Domain } from '../sim/types.ts'

/*
 * The sheet's colours. These are the only colours inside the drawing, and
 * they travel with it: the SVG carries them as custom properties on its root,
 * so an exported or printed sheet looks the same as the live one. (The app
 * chrome around the sheet takes its colours from styles/tokens.css.)
 *
 * The drawing itself is monochrome. Colour is kept for what is moving: a
 * flow's domain, a lit window, a level in a tank.
 */

export type ThemeId = 'sketchbook' | 'night' | 'light' | 'dark'

/** the order a picker lists them in, with the names it shows */
export const THEME_NAMES: Record<ThemeId, string> = {
  sketchbook: 'Sketchbook',
  night: 'Night',
  light: 'White',
  dark: 'Dark',
}
export const THEME_IDS = Object.keys(THEME_NAMES) as ThemeId[]

/** a theme whose paper is dark, for whatever has to sit on it */
export const isDark = (t: ThemeId) => t === 'dark' || t === 'night'

export interface SheetPalette {
  paper: string
  /** the hairline every link and tile is drawn with */
  line: string
  /** a tile's fill, a shade off the paper */
  tile: string
  ink: string
  muted: string
  lit: string
  alarm: string
  domain: Record<Domain, string>
}

export const THEMES: Record<ThemeId, SheetPalette> = {
  /**
   * cream sketchbook paper and manga ink, from vaibhav.co.uk — the editor's
   * own colours. The sakura neon marks trouble; the highlighter lights.
   */
  sketchbook: {
    paper: '#faf6ec',
    line: '#e2d8c3',
    tile: '#f3ecdd',
    ink: '#111111',
    muted: '#7a7263',
    lit: '#e8a800',
    alarm: '#ff2e63',
    domain: {
      light: '#e8a800',
      electric: '#ec7a00',
      water: '#2563eb',
      heat: '#ff2e63',
      fuel: '#0f9b8e',
      mechanical: '#6a6358',
      data: '#7c4dff',
      oil: '#a8581a',
      air: '#0891b2',
    },
  },
  /** the sketchbook after dark: warm black, cream ink, the same neon */
  night: {
    paper: '#131311',
    line: '#2b2a26',
    tile: '#1b1a17',
    ink: '#f3ecdd',
    muted: '#9b937f',
    lit: '#ffd84d',
    alarm: '#ff2e63',
    domain: {
      light: '#ffd84d',
      electric: '#ffa94d',
      water: '#5aa2ff',
      heat: '#ff5c85',
      fuel: '#3dd6c2',
      mechanical: '#b3ab98',
      data: '#a48bff',
      oil: '#e0974f',
      air: '#4cc9e6',
    },
  },
  /** white paper — for the website and for printing */
  light: {
    paper: '#ffffff',
    line: '#e3e3e1',
    tile: '#fafaf9',
    ink: '#18181b',
    muted: '#8a8a87',
    lit: '#f5b301',
    alarm: '#e5484d',
    domain: {
      light: '#f5b301',
      electric: '#f08c00',
      water: '#2f7cf6',
      heat: '#e5484d',
      fuel: '#12a594',
      mechanical: '#71717a',
      data: '#7c5cf0',
      oil: '#b4651e',
      air: '#0f9fbf',
    },
  },
  /** near-black — for a screen on a wall, where a dark sheet glows */
  dark: {
    paper: '#0b0b0c',
    line: '#2a2a2d',
    tile: '#131315',
    ink: '#ededee',
    muted: '#86868b',
    lit: '#ffc53d',
    alarm: '#ff6369',
    domain: {
      light: '#ffd60a',
      electric: '#ffa94d',
      water: '#5aa2ff',
      heat: '#ff6369',
      fuel: '#3dd6c2',
      mechanical: '#a1a1aa',
      data: '#a48bff',
      oil: '#e0974f',
      air: '#4cc9e6',
    },
  },
}

/** the palette as custom properties, for the sheet's root `style` */
export function paletteVars(p: SheetPalette): Record<string, string> {
  const vars: Record<string, string> = {
    '--paper': p.paper,
    '--line': p.line,
    '--tile': p.tile,
    '--ink': p.ink,
    '--muted': p.muted,
    '--lit': p.lit,
    '--alarm': p.alarm,
  }
  for (const [d, c] of Object.entries(p.domain)) vars[`--${d}`] = c
  return vars
}

export const DOMAIN_NAMES: Record<Domain, string> = {
  light: 'sunlight',
  electric: 'electricity',
  water: 'water',
  heat: 'heat',
  fuel: 'fuel',
  mechanical: 'shaft power',
  data: 'requests',
  oil: 'hydraulic oil',
  air: 'compressed air',
}
