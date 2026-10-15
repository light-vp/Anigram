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

export type ThemeId = 'light' | 'dark'

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
