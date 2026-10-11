// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

import { useFrame, usePrefersReducedMotion, useSimulation } from '../app/hooks'
import { Transport } from '../app/Transport'
import { shownParts } from '../packs/catalogue.ts'
import type { Frame } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'
import {
  CELL,
  HEAD_H,
  PAD,
  isEngineering,
  sheetSize,
} from '../view/geometry.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { instrumentAt, partAt } from './doc.ts'
import type { Cell, Doc } from './doc.ts'
import { GlyphIcon } from './Palette.tsx'
import styles from './Editor.module.css'

/*
 * The sheet as you edit it: the running drawing, and a transparent grid over
 * it that takes the clicks and drags. Remounted on every edit, so the
 * simulation never shows anything the solver didn't decide; the clock
 * survives, so an edit doesn't throw you back to dawn.
 */

export interface Clock {
  hour: number
  day: number
  speed: number
  playing: boolean
}

/** what dropping something on a cell means */
export type Drop =
  | { kind: 'click'; cell: Cell }
  | { kind: 'drag-part'; id: string; cell: Cell }
  | { kind: 'drag-instrument'; index: number; cell: Cell }

export interface CanvasProps {
  doc: Doc
  scene: Scene
  theme: ThemeId
  clock: { current: Clock }
  /** the selected part's id, for the sheet's highlight */
  selected: string | null
  /** something is armed in the palette, or a link is being drawn */
  armed: string | null
  linkFrom: string | null
  onDrop: (drop: Drop) => void
  note: string | null
  children: (frame: Frame) => ReactNode
}

export function Canvas({
  doc,
  scene,
  theme,
  clock,
  selected,
  armed,
  linkFrom,
  onDrop,
  note,
  children,
}: CanvasProps) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => {
    s.seek(clock.current.hour)
    s.day = clock.current.day
    s.setSpeed(clock.current.speed)
    s.setPlaying(clock.current.playing && !reduced)
  })
  const frame = useFrame(sim)

  useEffect(() => {
    sim.animate = !reduced
  }, [sim, reduced])

  useEffect(() => {
    clock.current = {
      hour: frame.hour,
      day: frame.day,
      speed: sim.speed,
      playing: sim.playing,
    }
  }, [frame, sim, clock])

  // space plays and pauses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, button, select, dialog')) return
      if (e.key === ' ') {
        e.preventDefault()
        sim.setPlaying(!sim.playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const { w, h } = sheetSize(scene)

  return (
    <>
      <div className={styles.stage}>
        <div
          className={styles.sheetWrap}
          // as wide as the column allows, but short enough to keep the clock in view
          style={{
            aspectRatio: `${w} / ${h}`,
            maxWidth: `calc((100vh - 190px) * ${(w / h).toFixed(4)})`,
          }}
        >
          <Sheet
            scene={scene}
            frame={frame}
            theme={theme}
            annotate={reduced}
            animate={!reduced}
            selected={selected}
            className={styles.sheet}
          />
          <Overlay
            doc={doc}
            scene={scene}
            w={w}
            h={h}
            armed={armed}
            linkFrom={linkFrom}
            selected={selected}
            onDrop={onDrop}
          />
        </div>
        <p className={styles.note} aria-live="polite">
          {note ??
            (doc.parts.length === 0
              ? 'An empty sheet. Pick a part on the left to begin.'
              : ' ')}
        </p>
        <Transport sim={sim} frame={frame} />
      </div>
      {children(frame)}
    </>
  )
}

/** a part with links the drawing doesn't show, as against one not yet linked at all */
const offSheet = (doc: Doc, id: string) =>
  doc.links.some((l) => l.from === id || l.to === id)

const centre = ([c, r]: readonly number[]) =>
  [PAD + c! * CELL + CELL / 2, HEAD_H + r! * CELL + CELL / 2] as const

/** the grid you build on, drawn over the sheet */
function Overlay({
  doc,
  scene,
  w,
  h,
  armed,
  linkFrom,
  selected,
  onDrop,
}: {
  doc: Doc
  scene: Scene
  w: number
  h: number
  armed: string | null
  linkFrom: string | null
  selected: string | null
  onDrop: (drop: Drop) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [drag, setDrag] = useState<{
    what: { id: string } | { index: number }
    from: Cell
    moved: boolean
    x: number
    y: number
  } | null>(null)

  const toSheet = (e: ReactPointerEvent) => {
    const svg = ref.current
    if (!svg) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    )
    const c = Math.floor((pt.x - PAD) / CELL)
    const r = Math.floor((pt.y - HEAD_H) / CELL)
    const inside = c >= 0 && r >= 0 && c < doc.size[0] && r < doc.size[1]
    return { x: pt.x, y: pt.y, cell: inside ? ([c, r] as Cell) : null }
  }

  const target = hover ? partAt(doc, hover) : undefined
  const busy = !!(armed || linkFrom || drag)
  // parts the drawing leaves off are still on the scene: shown faintly, so they can be edited
  const hidden = isEngineering(scene)
    ? doc.parts.filter((p) => !shownParts(scene).has(p.id))
    : []
  const dragKind =
    drag && 'id' in drag.what
      ? doc.parts.find((p) => p.id === (drag.what as { id: string }).id)?.kind
      : undefined

  return (
    <svg
      ref={ref}
      className={busy ? `${styles.overlay} ${styles.busy}` : styles.overlay}
      viewBox={`0 0 ${w} ${h}`}
      onPointerDown={(e) => {
        const at = toSheet(e)
        if (!at?.cell || armed || linkFrom) return
        const here = partAt(doc, at.cell)
        const inst = instrumentAt(doc, at.cell)
        if (!here && inst < 0) return
        ref.current?.setPointerCapture(e.pointerId)
        setDrag({
          what: here ? { id: here.id } : { index: inst },
          from: at.cell,
          moved: false,
          x: at.x,
          y: at.y,
        })
      }}
      onPointerMove={(e) => {
        const at = toSheet(e)
        setHover(at?.cell ?? null)
        if (drag && at) {
          const moved =
            drag.moved ||
            !at.cell ||
            at.cell[0] !== drag.from[0] ||
            at.cell[1] !== drag.from[1]
          setDrag({ ...drag, moved, x: at.x, y: at.y })
        }
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => {
        const at = toSheet(e)
        const d = drag
        setDrag(null)
        if (!at?.cell) return
        if (d?.moved)
          onDrop(
            'id' in d.what
              ? { kind: 'drag-part', id: d.what.id, cell: at.cell }
              : { kind: 'drag-instrument', index: d.what.index, cell: at.cell },
          )
        else onDrop({ kind: 'click', cell: at.cell })
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {/* the grid, faint, so you can see where things can go */}
      {Array.from({ length: doc.size[0] * doc.size[1] }, (_, i) => {
        const c = i % doc.size[0]
        const r = Math.floor(i / doc.size[0])
        if (partAt(doc, [c, r]) || instrumentAt(doc, [c, r]) >= 0) return null
        const [x, y] = centre([c, r])
        return <circle key={i} className={styles.dot} cx={x} cy={y} r={1.6} />
      })}

      {hidden.map((p) => {
        const [x, y] = centre(p.at)
        return (
          <g
            key={p.id}
            className={styles.offDrawing}
            transform={`translate(${x} ${y})`}
          >
            <rect x={-30} y={-30} width={60} height={60} rx={14} />
            <text y={44} textAnchor="middle">
              {p.label}
            </text>
            <text y={56} textAnchor="middle" className={styles.offDrawingNote}>
              {offSheet(doc, p.id)
                ? 'not on this drawing'
                : 'connect it to draw it'}
            </text>
          </g>
        )
      })}

      {hover &&
        !target &&
        instrumentAt(doc, hover) < 0 &&
        (armed || (drag?.moved && dragKind)) && (
          <PlaceGhost kind={dragKind ?? null} at={centre(hover)} />
        )}

      {hover &&
        target &&
        (drag?.moved || linkFrom) &&
        target.id !== (drag && 'id' in drag.what ? drag.what.id : linkFrom) && (
          <rect
            className={styles.targetRing}
            x={centre(hover)[0] - 32}
            y={centre(hover)[1] - 32}
            width={64}
            height={64}
            rx={16}
          />
        )}

      {hover && target && !busy && target.id !== selected && (
        <rect
          className={styles.hoverRing}
          x={centre(hover)[0] - 30}
          y={centre(hover)[1] - 30}
          width={60}
          height={60}
          rx={15}
        />
      )}

      {drag?.moved && (
        <line
          className={styles.wire}
          x1={centre(drag.from)[0]}
          y1={centre(drag.from)[1]}
          x2={drag.x}
          y2={drag.y}
        />
      )}

      {linkFrom &&
        (() => {
          const from = doc.parts.find((p) => p.id === linkFrom)
          if (!from) return null
          const [x, y] = centre(from.at)
          return <circle className={styles.linkFrom} cx={x} cy={y} r={36} />
        })()}
    </svg>
  )
}

function PlaceGhost({
  kind,
  at: [x, y],
}: {
  kind: string | null
  at: readonly [number, number]
}) {
  return (
    <g className={styles.ghost} transform={`translate(${x} ${y})`}>
      <rect x={-26} y={-26} width={52} height={52} rx={14} />
      {kind && <GlyphIcon kind={kind} />}
    </g>
  )
}
