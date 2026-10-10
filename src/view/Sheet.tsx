// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { CSSProperties, Ref } from 'react'
import { useMemo } from 'react'

import { glyphFor } from '../parts/index.ts'
import { clockTime } from '../sim/profiles.ts'
import type { Frame } from '../sim/runtime.ts'
import type { LinkState } from '../sim/solver.ts'
import type { Domain, LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import { rate, readout } from './format.ts'
import {
  CELL,
  FRAME,
  PAD,
  TITLE_H,
  cellToPx,
  linkPoints,
  roundedPath,
  sheetSize,
} from './geometry.ts'
import type { Pt } from './geometry.ts'
import { DOMAIN_NAMES, THEMES, paletteVars } from './palette.ts'
import type { ThemeId } from './palette.ts'
import {
  LABEL_OFFSET,
  glyphBox,
  labelBox,
  labelRect,
  placeTags,
} from './layout.ts'
import type { Tag } from './layout.ts'
import { SHEET_CSS } from './sheetStyle.ts'
import { trace } from './trace.ts'

export interface SheetProps {
  scene: Scene
  frame: Frame
  theme: ThemeId
  /** print every flow's value and direction on the sheet (paper mode, reduced motion) */
  annotate: boolean
  /** let flows travel and parts spin */
  animate: boolean
  selected: string | null
  onSelect?: (id: string | null) => void
  onToggle?: (switchId: string) => void
  svgRef?: Ref<SVGSVGElement>
  className?: string
}

interface LinkLook {
  /** outer / inner stroke widths of a pipe or shaft; none for a wire */
  pipe?: [number, number]
  dash: string
  cap: 'round' | 'butt'
}

const LOOK: Record<Domain, LinkLook> = {
  light: { dash: '3 9', cap: 'round' },
  electric: { dash: '9 13', cap: 'round' },
  water: { pipe: [11, 7], dash: '0.5 9', cap: 'round' },
  fuel: { pipe: [9, 5.5], dash: '0.5 11', cap: 'round' },
  heat: { dash: '5 9', cap: 'round' },
  mechanical: { pipe: [10, 6], dash: '2.5 6.5', cap: 'butt' },
  data: { dash: '0.5 8', cap: 'round' },
}

export function Sheet({
  scene,
  frame,
  theme,
  annotate,
  animate,
  selected,
  onSelect,
  onToggle,
  svgRef,
  className,
}: SheetProps) {
  const { w, h } = sheetSize(scene)
  const geometry = useMemo(
    () => scene.links.map((l) => linkPoints(scene, l)),
    [scene],
  )
  const traced =
    selected && frame.links.length ? trace(scene, frame.links, selected) : null
  // a part with nothing flowing through it (a tripped breaker) dims nothing
  const lit = traced && traced.links.size ? traced : null
  const vars = paletteVars(THEMES[theme]) as CSSProperties
  const tags = annotate ? flowTags(scene, frame, geometry) : []

  return (
    <svg
      ref={svgRef}
      className={className ? `sheet ${className}` : 'sheet'}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      style={vars}
      role="img"
      aria-label={`${scene.title}: ${scene.subtitle}`}
      onClick={() => onSelect?.(null)}
    >
      <style>{SHEET_CSS}</style>
      <defs>
        <pattern
          id="dots"
          width={CELL / 4}
          height={CELL / 4}
          patternUnits="userSpaceOnUse"
          x={PAD}
          y={PAD}
        >
          <circle cx={1} cy={1} r={1} className="gridDot" />
        </pattern>
      </defs>
      <rect className="bg" width={w} height={h} />
      <rect
        fill="url(#dots)"
        x={FRAME}
        y={FRAME}
        width={w - FRAME * 2}
        height={h - FRAME * 2 - TITLE_H + 16}
      />
      <Frame scene={scene} w={w} h={h} />

      <g>
        {scene.links.map((link, i) => (
          <LinkView
            key={i}
            scene={scene}
            link={link}
            pts={geometry[i]!}
            st={frame.links[i]}
            phase={animate ? frame.linkPhase[i]! : 0}
            animate={animate}
            dim={!!lit && !lit.links.has(i)}
          />
        ))}
      </g>

      <g>
        {scene.parts.map((part) => (
          <PartView
            key={part.id}
            part={part}
            frame={frame}
            selected={selected === part.id}
            dim={!!lit && !lit.parts.has(part.id)}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </g>

      <g>
        {scene.parts.map((part) => (
          <PartLabel
            key={part.id}
            scene={scene}
            part={part}
            frame={frame}
            dim={!!lit && !lit.parts.has(part.id)}
          />
        ))}
      </g>

      <g>
        {tags.map((t) => (
          <FlowTag
            key={t.link}
            tag={t}
            color={`var(--${scene.links[t.link]!.domain})`}
            dim={!!lit && !lit.links.has(t.link)}
          />
        ))}
      </g>

      <TitleBlock scene={scene} frame={frame} w={w} h={h} />
    </svg>
  )
}

function flowTags(scene: Scene, frame: Frame, geometry: Pt[][]): Tag[] {
  const obstacles = scene.parts.flatMap((p) => {
    const s = frame.parts[p.id]
    return s
      ? [glyphBox(p), labelBox(p, readout(scene, p, s).value)]
      : [glyphBox(p)]
  })
  const items = scene.links.flatMap((l, i) => {
    const flow = frame.links[i]?.flow ?? 0
    return flow > 1e-6
      ? [{ link: i, pts: geometry[i]!, text: rate(scene, l.domain, flow) }]
      : []
  })
  return placeTags(items, obstacles)
}

// ---- links ----------------------------------------------------------------

function LinkView({
  scene,
  link,
  pts,
  st,
  phase,
  animate,
  dim,
}: {
  scene: Scene
  link: LinkSpec
  pts: Pt[]
  st: LinkState | undefined
  phase: number
  animate: boolean
  dim: boolean
}) {
  const d = roundedPath(pts)
  const look = LOOK[link.domain]
  const color = `var(--${link.domain})`
  const flow = st?.flow ?? 0
  const rel = Math.min(1.4, flow / (scene.scale[link.domain] ?? 100))
  const on = flow > 1e-6
  const atLimit =
    !!st && Number.isFinite(st.capacity) && on && flow >= st.capacity * 0.995
  const band = 2 + 12 * Math.sqrt(rel)
  const from = scene.parts.find((p) => p.id === link.from)!.label
  const to = scene.parts.find((p) => p.id === link.to)!.label

  return (
    <g className={dim ? 'link dim' : 'link'}>
      <title>{`${from} → ${to}: ${rate(scene, link.domain, flow)} of ${DOMAIN_NAMES[link.domain]}${
        st && Number.isFinite(st.capacity)
          ? ` (limit ${rate(scene, link.domain, st.capacity)})`
          : ''
      }`}</title>
      {look.pipe ? (
        <>
          <path
            d={d}
            className="pipeOuter"
            strokeWidth={look.pipe[0]}
            stroke={atLimit ? 'var(--alarm)' : undefined}
          />
          <path d={d} className="pipeInner" strokeWidth={look.pipe[1]} />
          {on && (
            <path
              d={d}
              className="band"
              stroke={color}
              strokeWidth={look.pipe[1]}
              opacity={0.2 + 0.5 * Math.min(1, rel)}
            />
          )}
        </>
      ) : (
        <>
          <path
            d={d}
            className={
              link.loss ? 'rail loss' : atLimit ? 'rail limit' : 'rail'
            }
          />
          {on && (
            <path d={d} className="band" stroke={color} strokeWidth={band} />
          )}
        </>
      )}
      {on && animate && (
        <path
          d={d}
          className="flow"
          stroke={link.domain === 'mechanical' ? 'var(--ink)' : color}
          strokeWidth={
            look.pipe
              ? look.pipe[1] * (link.domain === 'mechanical' ? 1 : 0.6)
              : Math.max(2.4, band * 0.45)
          }
          strokeLinecap={look.cap}
          strokeDasharray={look.dash}
          strokeDashoffset={-phase}
        />
      )}
    </g>
  )
}

/** paper mode: an arrow showing which way it flows, and a pill saying how much */
function FlowTag({
  tag,
  color,
  dim,
}: {
  tag: Tag
  color: string
  dim: boolean
}) {
  const { at, cx, cy, w, text } = tag
  return (
    <g className={dim ? 'dim' : undefined}>
      <g transform={`translate(${at.x} ${at.y}) rotate(${at.angle})`}>
        <path
          d="M-7 -6 L5 0 L-7 6 Z"
          fill={color}
          stroke="var(--ink)"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </g>
      <rect
        className="tagBg"
        x={cx - w / 2}
        y={cy - 8}
        width={w}
        height={16}
        rx={8}
        stroke={color}
      />
      <text className="tag" x={cx} y={cy + 0.5} fill="var(--ink)">
        {text}
      </text>
    </g>
  )
}

// ---- parts ----------------------------------------------------------------

function PartView({
  part,
  frame,
  selected,
  dim,
  onSelect,
  onToggle,
}: {
  part: PartSpec
  frame: Frame
  selected: boolean
  dim: boolean
  onSelect?: (id: string | null) => void
  onToggle?: (switchId: string) => void
}) {
  const s = frame.parts[part.id]
  if (!s) return null
  const [x, y] = cellToPx(part.at)
  const Glyph = glyphFor(part.kind)
  const cls = [
    'part',
    'selectable',
    part.toggles && 'clicky',
    selected && 'selected',
    dim && 'dim',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <g
      className={cls}
      transform={`translate(${x} ${y})`}
      onClick={(e) => {
        e.stopPropagation()
        if (part.toggles) onToggle?.(part.toggles)
        onSelect?.(part.id)
      }}
    >
      <Glyph s={s} phase={frame.partPhase[part.id] ?? 0} />
      <circle className="ring" r={46} />
      <circle className="hit" r={44} />
    </g>
  )
}

function PartLabel({
  scene,
  part,
  frame,
  dim,
}: {
  scene: Scene
  part: PartSpec
  frame: Frame
  dim: boolean
}) {
  const s = frame.parts[part.id]
  if (!s) return null
  const [x, y] = cellToPx(part.at)
  const o = LABEL_OFFSET[part.labelSide ?? 'below']
  const r = readout(scene, part, s)
  // a paper backing so links running behind a label don't strike through it
  const bg = labelRect(part, r.value)
  return (
    <g
      className={dim ? 'dim' : undefined}
      transform={`translate(${x + o.dx} ${y + o.dy})`}
      pointerEvents="none"
    >
      <rect
        className="labelBg"
        x={bg.x}
        y={bg.y}
        width={bg.w}
        height={bg.h}
        rx={3}
      />
      <text className="label" textAnchor={o.anchor}>
        {part.label}
      </text>
      <text
        className={r.bad ? 'value bad' : 'value'}
        textAnchor={o.anchor}
        y={13}
      >
        {r.value}
      </text>
    </g>
  )
}

// ---- the drawing furniture -------------------------------------------------

function Frame({ scene, w, h }: { scene: Scene; w: number; h: number }) {
  const cols = scene.size[0]
  const rows = scene.size[1]
  const marks = []
  for (let c = 0; c < cols; c++) {
    const x = PAD + c * CELL + CELL / 2
    marks.push(
      <text key={`t${c}`} className="zone" x={x} y={FRAME + 9}>
        {c + 1}
      </text>,
    )
    if (c > 0) {
      marks.push(
        <line
          key={`tl${c}`}
          className="frameThin"
          x1={PAD + c * CELL}
          y1={FRAME}
          x2={PAD + c * CELL}
          y2={FRAME + 5}
        />,
      )
    }
  }
  for (let r = 0; r < rows; r++) {
    const y = PAD + r * CELL + CELL / 2
    marks.push(
      <text key={`l${r}`} className="zone" x={FRAME + 9} y={y}>
        {String.fromCharCode(65 + r)}
      </text>,
    )
    if (r > 0) {
      marks.push(
        <line
          key={`ll${r}`}
          className="frameThin"
          x1={FRAME}
          y1={PAD + r * CELL}
          x2={FRAME + 5}
          y2={PAD + r * CELL}
        />,
      )
    }
  }
  return (
    <g>
      <rect
        className="frame"
        x={FRAME}
        y={FRAME}
        width={w - FRAME * 2}
        height={h - FRAME * 2}
      />
      {marks}
    </g>
  )
}

function TitleBlock({
  scene,
  frame,
  w,
  h,
}: {
  scene: Scene
  frame: Frame
  w: number
  h: number
}) {
  const top = h - FRAME - (TITLE_H - 16)
  const height = TITLE_H - 16
  const inner = w - FRAME * 2
  const c1 = FRAME
  const c2 = FRAME + inner * 0.42
  const c3 = FRAME + inner * 0.75
  const c4 = FRAME + inner * 0.86
  const domains = [...new Set(scene.links.map((l) => l.domain))]
  return (
    <g>
      <rect className="frame" x={FRAME} y={top} width={inner} height={height} />
      {[c2, c3, c4].map((x) => (
        <line
          key={x}
          className="frameThin"
          x1={x}
          y1={top}
          x2={x}
          y2={top + height}
        />
      ))}

      <text className="tbLabel" x={c1 + 12} y={top + 14}>
        title
      </text>
      <text className="tbTitle" x={c1 + 12} y={top + 37}>
        {scene.title}
      </text>
      <ClampedText
        className="tbSub"
        x={c1 + 12}
        y={top + 54}
        width={c2 - c1 - 24}
        text={scene.subtitle}
      />

      <text className="tbLabel" x={c2 + 12} y={top + 14}>
        what flows
      </text>
      {domains.map((d, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = c2 + 12 + col * ((c3 - c2 - 12) / 2)
        const y = top + 30 + row * 15
        return (
          <g key={d}>
            <line
              x1={x}
              y1={y}
              x2={x + 16}
              y2={y}
              stroke={`var(--${d})`}
              strokeWidth={5}
              strokeLinecap="round"
            />
            <text className="tbSmall" x={x + 22} y={y + 3.5}>
              {DOMAIN_NAMES[d]}
              {scene.units[d] ? ` · ${scene.units[d]!.rate}` : ''}
            </text>
          </g>
        )
      })}

      <text className="tbLabel" x={c3 + 12} y={top + 14}>
        time
      </text>
      <text className="tbValue" x={c3 + 12} y={top + 38}>
        {clockTime(frame.hour)}
      </text>
      <text className="tbSmall" x={c3 + 12} y={top + 58}>
        day {frame.day + 1}
      </text>

      <text className="tbLabel" x={c4 + 12} y={top + 14}>
        dwg no.
      </text>
      <text className="tbValue" x={c4 + 12} y={top + 38}>
        {scene.sheet}
      </text>
      <text className="tbSmall" x={c4 + 12} y={top + 58}>
        scale: nts
      </text>
    </g>
  )
}

/** SVG text doesn't wrap: break a line into at most two, by an estimated width */
function ClampedText({
  x,
  y,
  width,
  text,
  className,
}: {
  x: number
  y: number
  width: number
  text: string
  className: string
}) {
  const perLine = Math.max(10, Math.floor(width / 6.4))
  const words = text.split(' ')
  const lines: string[] = ['']
  for (const word of words) {
    const cur = lines[lines.length - 1]!
    if ((cur + ' ' + word).trim().length > perLine && cur) {
      if (lines.length === 2) {
        lines[1] = `${lines[1]!.replace(/[,;:]?$/, '')}…`
        break
      }
      lines.push(word)
    } else lines[lines.length - 1] = (cur + ' ' + word).trim()
  }
  return (
    <text className={className} x={x} y={y}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>
          {l}
        </tspan>
      ))}
    </text>
  )
}
