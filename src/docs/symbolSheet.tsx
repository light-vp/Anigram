// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { PackSymbol } from '../packs/symbols.tsx'
import { SYMBOL_CSS } from '../packs/symbolCss.ts'
import { glyphFor } from '../parts/index.ts'
import type { PartState } from '../sim/solver.ts'
import type { PartSpec, SymbolSet } from '../sim/types.ts'
import { SHEET_CSS } from '../view/sheetStyle.ts'
import { THEMES, paletteVars } from '../view/palette.ts'

/*
 * One part or one symbol as a small standalone SVG, for the reference docs
 * (`npm run docs`). Drawn by the same components as the sheet, switched on
 * and mid-way through its work, so the docs show what a sheet shows.
 */

const SHOWN: PartState = {
  in: 1,
  out: 1,
  demand: 1,
  avail: 1,
  level: 0.6,
  fill: 0.6,
  loss: 0,
  open: 1,
  starting: false,
  activity: 0.6,
  effort: NaN,
  effortIn: NaN,
}

const SIZE = 72

function svg(body: ReactNode, eng: boolean): string {
  const vars = Object.entries(paletteVars(THEMES.light))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  const markup = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={eng ? 'sheet eng' : 'sheet'}
      width={SIZE}
      height={SIZE}
      viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
    >
      <style>{SHEET_CSS}</style>
      {eng && <style>{SYMBOL_CSS}</style>}
      <rect
        className="bg"
        x={-SIZE / 2}
        y={-SIZE / 2}
        width={SIZE}
        height={SIZE}
        rx={10}
      />
      {body}
    </svg>,
  )
  // custom properties can't go through React's style prop in static markup
  return markup.replace('<svg ', `<svg style="${vars}" `) + '\n'
}

/** a pictorial part, as it sits on its tile */
export function kindSvg(kind: string): string {
  const Glyph = glyphFor(kind)
  return svg(
    <g className="part">
      <rect className="tile" x={-26} y={-26} width={52} height={52} rx={14} />
      <Glyph s={SHOWN} phase={0} />
    </g>,
    false,
  )
}

/** an engineering symbol, in one symbol set */
export function classSvg(cls: string, symbols: SymbolSet): string {
  const part: PartSpec = {
    id: cls,
    kind: 'busbar',
    label: cls,
    at: [0, 0],
    behaviour: { role: 'bus' },
    class: cls,
  }
  return svg(
    <PackSymbol
      cls={cls}
      name={cls}
      s={SHOWN}
      phase={0}
      part={part}
      symbols={symbols}
      span={[-26, 26]}
    />,
    true,
  )
}
