// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Domain } from '../sim/types.ts'

/*
 * The sheet's colours. These are the only colours inside the drawing, and
 * they travel with it: the SVG carries them as custom properties on its root,
 * so an exported or printed sheet looks the same as the live one. (The app
 * chrome around the sheet takes its colours from styles/tokens.css.)
 */

export type ThemeId = 'paper' | 'blueprint'

export interface SheetPalette {
  paper: string
  grid: string
  ink: string
  muted: string
  lit: string
  alarm: string
  domain: Record<Domain, string>
}

export const THEMES: Record<ThemeId, SheetPalette> = {
  /** cream paper and ink — for the website and for printing */
  paper: {
    paper: '#f3ecdd',
    grid: '#e4d9c1',
    ink: '#1b1a17',
    muted: '#7d7466',
    lit: '#ffd84d',
    alarm: '#ff2e63',
    domain: {
      light: '#f2c230',
      electric: '#e3a008',
      water: '#2a78d4',
      heat: '#ff2e63',
      fuel: '#8a5426',
      mechanical: '#5d574d',
      data: '#7a3cf0',
    },
  },
  /** a blueprint — for a screen on a wall, where a dark sheet glows */
  blueprint: {
    paper: '#0c2747',
    grid: '#16395f',
    ink: '#e8f0ff',
    muted: '#8eaed4',
    lit: '#ffd84d',
    alarm: '#ff6b8b',
    domain: {
      light: '#fff1a8',
      electric: '#ffd84d',
      water: '#6cc4ff',
      heat: '#ff6b8b',
      fuel: '#f0b072',
      mechanical: '#c3cfdd',
      data: '#c9a2ff',
    },
  },
}

/** the palette as custom properties, for the sheet's root `style` */
export function paletteVars(p: SheetPalette): Record<string, string> {
  const vars: Record<string, string> = {
    '--paper': p.paper,
    '--grid': p.grid,
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
}
