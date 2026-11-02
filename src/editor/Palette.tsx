// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { CSSProperties } from 'react'

import { PACKS, reachOf } from '../packs/catalogue.ts'
import { PackSymbol } from '../packs/symbols.tsx'
import { drawGlyph } from '../parts/index.ts'
import type { PartState } from '../sim/solver.ts'
import type { DrawingType, PartSpec, SymbolSet } from '../sim/types.ts'
import { THEMES, paletteVars } from '../view/palette.ts'
import type { ThemeId } from '../view/palette.ts'
import { paletteFor } from './practice.ts'
import type { PaletteItem } from './practice.ts'
import styles from './Editor.module.css'

/** how a part looks in the bin: switched on and mid-way through its work */
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

export function GlyphIcon({ kind }: { kind: string }) {
  return drawGlyph(kind, { s: SHOWN, phase: 0 })
}

/**
 * a part as the sheet would draw it, at a size that fits a palette tile: its
 * practice symbol when the drawing has one for it, otherwise its picture
 */
export function PartIcon({
  part,
  drawing,
  symbols,
}: {
  part: PartSpec
  drawing: DrawingType | undefined
  symbols: SymbolSet
}) {
  const pack = drawing ? PACKS[drawing] : undefined
  const cls =
    part.class && pack && part.class in pack.classes ? part.class : undefined
  if (!cls) return <GlyphIcon kind={part.kind} />
  // a wide symbol (a directional valve, a cylinder's rod) is shrunk to fit
  const k = Math.min(0.8, 20 / reachOf(cls))
  return (
    <g transform={`scale(${+k.toFixed(3)})`}>
      <PackSymbol
        cls={cls}
        name={part.label}
        s={SHOWN}
        phase={0}
        part={part}
        symbols={symbols}
        span={[-24, 24]}
      />
    </g>
  )
}

/** a palette item as the sheet would draw it */
export function ItemIcon({
  item,
  drawing,
  symbols,
}: {
  item: PaletteItem
  drawing: DrawingType | undefined
  symbols: SymbolSet
}) {
  if (item.letters)
    return (
      <g>
        <circle r={16} className="ln" />
        <text className="bubbleText">{item.letters}</text>
      </g>
    )
  const part: PartSpec = {
    id: item.key,
    kind: item.template,
    label: item.name,
    at: [0, 0],
    behaviour: { role: 'bus' },
    class: item.class,
  }
  return <PartIcon part={part} drawing={drawing} symbols={symbols} />
}

/** the parts bin: the templates, or the sheet's own practice */
export function Palette({
  theme,
  drawing,
  symbols,
  armed,
  onArm,
}: {
  theme: ThemeId
  drawing: DrawingType | undefined
  symbols: SymbolSet
  armed: string | null
  onArm: (key: string) => void
}) {
  const vars = paletteVars(THEMES[theme]) as CSSProperties
  return (
    <nav className={styles.palette} aria-label="Parts">
      {paletteFor(drawing).map((g) => (
        <div key={g.id} className={styles.group}>
          <h2 className={styles.groupName}>{g.label}</h2>
          <div className={styles.bin}>
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                className={styles.piece}
                aria-pressed={armed === it.key}
                onClick={() => onArm(it.key)}
                title={it.note ? `${it.name}: ${it.note}` : it.name}
              >
                <svg
                  viewBox="-22 -22 44 44"
                  style={vars}
                  className={
                    drawing && drawing !== 'pictorial' ? 'eng' : undefined
                  }
                  aria-hidden="true"
                >
                  <ItemIcon item={it} drawing={drawing} symbols={symbols} />
                </svg>
                <span>{it.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
