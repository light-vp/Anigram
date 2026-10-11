// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PACKS } from '../packs/catalogue.ts'
import type { Scene } from '../sim/types.ts'
import { BORDER, TITLE_H, TITLE_W } from './geometry.ts'

/*
 * An engineering sheet's border and title block. The block follows ISO
 * 7200: who owns the drawing, what kind of document it is and its status
 * along the top; the title in the middle; who drew, checked and approved
 * it, when it was issued, its revision and its number along the bottom.
 * Fields the scene leaves out stay as empty boxes, as on a blank form.
 */

interface Cell {
  x: number
  w: number
  label: string
  value?: string
}

const ROWS = [24, 38, 28] as const

/** an estimated cut so a value stays inside its box */
function fit(text: string, width: number, px: number): string {
  const max = Math.floor(width / (px * 0.56))
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}

function Row({ y, h, cells }: { y: number; h: number; cells: Cell[] }) {
  return (
    <g>
      {cells.map((c) => (
        <g key={c.label}>
          <rect className="tbCell" x={c.x} y={y} width={c.w} height={h} />
          <text className="tbLabel" x={c.x + 4} y={y + 8}>
            {c.label}
          </text>
          {c.value && (
            <text className="tbValue" x={c.x + 4} y={y + h - 6}>
              {fit(c.value, c.w - 8, 9.5)}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

export function TitleBlock({
  scene,
  w,
  h,
}: {
  scene: Scene
  w: number
  h: number
}) {
  const tb = scene.titleBlock ?? {}
  const x0 = w - BORDER - TITLE_W
  const y0 = h - BORDER - TITLE_H
  const at = (x: number) => x0 + x
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  const [r1, r2, r3] = ROWS
  return (
    <g className="titleBlock">
      <Row
        y={y0}
        h={r1}
        cells={[
          { x: at(0), w: 150, label: 'OWNER', value: tb.owner },
          { x: at(150), w: 120, label: 'DOCUMENT TYPE', value: pack?.name },
          { x: at(270), w: 110, label: 'STATUS', value: tb.status },
        ]}
      />
      <rect className="tbCell" x={x0} y={y0 + r1} width={TITLE_W} height={r2} />
      <text className="tbLabel" x={x0 + 4} y={y0 + r1 + 8}>
        {tb.project ? `TITLE · ${tb.project.toUpperCase()}` : 'TITLE'}
      </text>
      <text className="tbTitle" x={x0 + 4} y={y0 + r1 + 22}>
        {fit(scene.title, TITLE_W - 8, 12.5)}
      </text>
      {scene.subtitle && (
        <text className="tbValue muted" x={x0 + 4} y={y0 + r1 + 33}>
          {fit(scene.subtitle, TITLE_W - 8, 8.5)}
        </text>
      )}
      <Row
        y={y0 + r1 + r2}
        h={r3}
        cells={[
          { x: at(0), w: 60, label: 'DRAWN', value: tb.drawnBy },
          { x: at(60), w: 60, label: 'CHECKED', value: tb.checkedBy },
          { x: at(120), w: 60, label: 'APPROVED', value: tb.approvedBy },
          { x: at(180), w: 70, label: 'ISSUED', value: tb.issued },
          { x: at(250), w: 30, label: 'REV', value: tb.revision },
          { x: at(280), w: 100, label: 'DRAWING NO.', value: scene.sheet },
        ]}
      />
      <rect
        className="tbFrame"
        x={x0}
        y={y0}
        width={TITLE_W}
        height={TITLE_H}
      />
    </g>
  )
}

/** the drawing's border, inset from the sheet's edge */
export function Border({ w, h }: { w: number; h: number }) {
  return (
    <rect
      className="tbFrame"
      x={BORDER}
      y={BORDER}
      width={w - BORDER * 2}
      height={h - BORDER * 2}
    />
  )
}
