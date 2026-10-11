// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { CSSProperties, Ref } from 'react'
import { useMemo } from 'react'

import { shownParts, shows } from '../packs/catalogue.ts'
import { SYMBOL_CSS } from '../packs/symbolCss.ts'
import { BAR_KINDS, glyphFor } from '../parts/index.ts'
import { clockTime } from '../sim/profiles.ts'
import type { Frame } from '../sim/runtime.ts'
import type { LinkState } from '../sim/solver.ts'
import type {
  Domain,
  InstrumentSpec,
  LinkSpec,
  PartSpec,
  Scene,
} from '../sim/types.ts'
import { rate, readout } from './format.ts'
import {
  FOOT_H,
  PAD,
  TILE,
  TILE_R,
  cellToPx,
  linkAnchor,
  linkPoints,
  roundedPath,
  sheetSize,
} from './geometry.ts'
import type { Pt } from './geometry.ts'
import { DOMAIN_NAMES, THEMES, paletteVars } from './palette.ts'
import type { ThemeId } from './palette.ts'
import { LABEL_OFFSET, glyphBox, labelBox, placeTags } from './layout.ts'
import type { Tag } from './layout.ts'
import { SHEET_CSS } from './sheetStyle.ts'
import { trace } from './trace.ts'
import {
  EngInstrument,
  EngLabel,
  EngLegend,
  EngLink,
  EngPart,
  InstrumentLines,
} from './engineering.tsx'
import { partWay } from './lines.ts'
import { measuredPart } from '../sim/instruments.ts'

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
  /** sign the bottom corner "Made with Anigram · Vaibhav Patel" (default true) */
  credit?: boolean
}

/** the line every sheet carries unless its maker turns it off */
export const CREDIT = 'Made with Anigram · Vaibhav Patel'
export const CREDIT_URL = 'https://anigram.vaibhav.co.uk'

/** the moving dots' spacing, by what flows: sparks for current, beads for water */
const SPACING: Record<Domain, number> = {
  light: 14,
  electric: 18,
  water: 12,
  heat: 16,
  fuel: 14,
  mechanical: 10,
  data: 9,
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
  credit = true,
}: SheetProps) {
  const { w, h } = sheetSize(scene)
  // an engineering drawing draws a two-way pair (charge and discharge) as one line
  const eng = !!scene.drawing && scene.drawing !== 'pictorial'
  const geometry = useMemo(
    () => scene.links.map((l) => linkPoints(scene, l, !eng)),
    [scene, eng],
  )
  const traced =
    selected && frame.links.length ? trace(scene, frame.links, selected) : null
  // a part with nothing flowing through it (a tripped breaker) dims nothing
  const lit = traced && traced.links.size ? traced : null
  const vars = paletteVars(THEMES[theme]) as CSSProperties
  // an engineering drawing draws only what its practice shows
  const shown = eng ? shownParts(scene) : null
  const drawn = (i: number) => !eng || shows(scene.links[i]!, scene)
  const tags = annotate ? flowTags(scene, frame, geometry, shown, drawn) : []
  // instruments are a P&ID's
  const instruments = scene.drawing === 'pid' ? (scene.instruments ?? []) : []
  // an instrument dims with the part at the end of its signal
  const quiet = (i: InstrumentSpec) =>
    !!lit && !lit.parts.has(measuredPart(i, scene)?.id ?? '')

  return (
    <svg
      ref={svgRef}
      className={['sheet', eng && 'eng', className].filter(Boolean).join(' ')}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      style={vars}
      role="img"
      aria-label={`${scene.title}: ${scene.subtitle}`}
      onClick={() => onSelect?.(null)}
    >
      <style>{SHEET_CSS}</style>
      {eng && <style>{SYMBOL_CSS}</style>}
      <rect className="bg" width={w} height={h} />
      <Header scene={scene} frame={frame} w={w} />

      <g>
        {scene.links.map((link, i) =>
          eng ? (
            drawn(i) &&
            twinBefore(scene, i) < 0 && (
              <EngLink
                key={i}
                scene={scene}
                link={link}
                pts={geometry[i]!}
                st={frame.links[i]}
                back={frame.links[twinAfter(scene, i)]}
                phase={animate ? frame.linkPhase[i]! : 0}
                animate={animate}
                dim={!!lit && !lit.links.has(i)}
              />
            )
          ) : (
            <LinkView
              key={i}
              scene={scene}
              link={link}
              pts={geometry[i]!}
              st={frame.links[i]}
              phase={animate ? frame.linkPhase[i]! : 0}
              animate={animate}
              annotate={annotate}
              dim={!!lit && !lit.links.has(i)}
            />
          ),
        )}
        {instruments.map((inst) => (
          <InstrumentLines
            key={inst.tag}
            scene={scene}
            inst={inst}
            dim={quiet(inst)}
          />
        ))}
      </g>

      <g>
        {scene.parts.map((part) =>
          eng ? (
            shown!.has(part.id) && (
              <EngPart
                key={part.id}
                scene={scene}
                part={part}
                frame={frame}
                way={partWay(
                  part,
                  scene.links.filter((_, i) => drawn(i)),
                  geometry.filter((_, i) => drawn(i)),
                )}
                selected={selected === part.id}
                dim={!!lit && !lit.parts.has(part.id)}
                onClick={() => {
                  if (part.toggles) onToggle?.(part.toggles)
                  onSelect?.(part.id)
                }}
              />
            )
          ) : (
            <PartView
              key={part.id}
              scene={scene}
              part={part}
              frame={frame}
              selected={selected === part.id}
              dim={!!lit && !lit.parts.has(part.id)}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ),
        )}
      </g>

      <g>
        {scene.parts.map((part) =>
          eng ? (
            shown!.has(part.id) && (
              <EngLabel
                key={part.id}
                scene={scene}
                part={part}
                frame={frame}
                dim={!!lit && !lit.parts.has(part.id)}
              />
            )
          ) : (
            <PartLabel
              key={part.id}
              scene={scene}
              part={part}
              frame={frame}
              dim={!!lit && !lit.parts.has(part.id)}
            />
          ),
        )}
      </g>

      {instruments.length > 0 && (
        <g>
          {instruments.map((inst) => (
            <EngInstrument
              key={inst.tag}
              scene={scene}
              inst={inst}
              frame={frame}
              dim={quiet(inst)}
            />
          ))}
        </g>
      )}

      <g>
        {tags.map((t) => (
          <FlowTag key={t.link} tag={t} dim={!!lit && !lit.links.has(t.link)} />
        ))}
      </g>

      {eng ? (
        <EngLegend
          scene={scene}
          links={scene.links.filter((_, i) => drawn(i))}
          h={h}
          also={instruments.flatMap((i) =>
            i.drives || scene.instruments?.some((o) => o.tag === i.measures)
              ? [i.signal ?? 'signal']
              : [],
          )}
        />
      ) : (
        <Legend scene={scene} h={h} />
      )}
      {credit && <Credit scene={scene} w={w} h={h} />}
    </svg>
  )
}

/** the earlier link of a two-way pair, if this is the later one */
function twinBefore(scene: Scene, i: number): number {
  const l = scene.links[i]!
  return scene.links.findIndex(
    (o, j) =>
      j < i && o.from === l.to && o.to === l.from && o.domain === l.domain,
  )
}

/** the later link of a two-way pair, if this is the earlier one */
function twinAfter(scene: Scene, i: number): number {
  const l = scene.links[i]!
  return scene.links.findIndex(
    (o, j) =>
      j > i && o.from === l.to && o.to === l.from && o.domain === l.domain,
  )
}

function flowTags(
  scene: Scene,
  frame: Frame,
  geometry: Pt[][],
  shown: Set<string> | null,
  drawn: (i: number) => boolean,
): Tag[] {
  const parts = shown ? scene.parts.filter((p) => shown.has(p.id)) : scene.parts
  const obstacles = parts.flatMap((p) => {
    const s = frame.parts[p.id]
    return s && !BAR_KINDS.has(p.kind)
      ? [glyphBox(p), labelBox(p, readout(scene, p, s).value)]
      : [glyphBox(p)]
  })
  const items = scene.links.flatMap((l, i) => {
    const flow = frame.links[i]?.flow ?? 0
    return flow > 1e-6 && drawn(i)
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
  annotate,
  dim,
}: {
  scene: Scene
  link: LinkSpec
  pts: Pt[]
  st: LinkState | undefined
  phase: number
  animate: boolean
  annotate: boolean
  dim: boolean
}) {
  const d = roundedPath(pts)
  const color = `var(--${link.domain})`
  const flow = st?.flow ?? 0
  const rel = Math.min(1.4, flow / (scene.scale[link.domain] ?? 100))
  const on = flow > 1e-6
  const atLimit =
    !!st && Number.isFinite(st.capacity) && on && flow >= st.capacity * 0.995
  // how much flows is how thick the line is, within a narrow, quiet range
  const width = 1.5 + 2.5 * Math.sqrt(Math.min(1, rel))
  const gap = SPACING[link.domain]
  const from = scene.parts.find((p) => p.id === link.from)!.label
  const to = scene.parts.find((p) => p.id === link.to)!.label
  const route = link.loss ? 'route loss' : atLimit ? 'route limit' : 'route'

  return (
    <g className={dim ? 'link dim' : 'link'}>
      <title>{`${from} → ${to}: ${rate(scene, link.domain, flow)} of ${DOMAIN_NAMES[link.domain]}${
        st && Number.isFinite(st.capacity)
          ? ` (limit ${rate(scene, link.domain, st.capacity)})`
          : ''
      }`}</title>
      <path d={d} className={route} />
      {on && !link.loss && (
        <path
          d={d}
          className="stream"
          stroke={color}
          strokeWidth={width}
          opacity={animate ? 0.28 : 0.85}
        />
      )}
      {on && link.loss && !animate && (
        <path
          d={d}
          className="stream"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="1 5"
        />
      )}
      {on && animate && (
        <path
          d={d}
          className="stream"
          stroke={color}
          strokeWidth={link.loss ? 2.5 : width + 1.5}
          strokeDasharray={`0 ${gap}`}
          strokeDashoffset={-phase * (gap / 14)}
        />
      )}
      {on && annotate && <Chevron pts={pts} color={color} />}
    </g>
  )
}

/** which way it flows, as a small open chevron at the middle of the longest run */
function Chevron({ pts, color }: { pts: Pt[]; color: string }) {
  const at = linkAnchor(pts)
  return (
    <path
      className="chev"
      stroke={color}
      d="M-3.5 -4.5 L1.5 0 L-3.5 4.5"
      transform={`translate(${at.x} ${at.y}) rotate(${at.angle})`}
    />
  )
}

/** paper mode: how much flows, beside the chevron */
function FlowTag({ tag, dim }: { tag: Tag; dim: boolean }) {
  return (
    <text
      className={dim ? 'tag dim' : 'tag'}
      x={tag.cx}
      y={tag.cy}
      pointerEvents="none"
    >
      {tag.text}
    </text>
  )
}

// ---- parts ----------------------------------------------------------------

function PartView({
  scene,
  part,
  frame,
  selected,
  dim,
  onSelect,
  onToggle,
}: {
  scene: Scene
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
  const bar = BAR_KINDS.has(part.kind)
  const cls = [
    'part',
    'selectable',
    selected && 'selected',
    readout(scene, part, s).bad && 'bad',
    dim && 'dim',
  ]
    .filter(Boolean)
    .join(' ')
  const half = TILE / 2
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
      {!bar && (
        <rect
          className="tile"
          x={-half}
          y={-half}
          width={TILE}
          height={TILE}
          rx={TILE_R}
        />
      )}
      <Glyph s={s} phase={frame.partPhase[part.id] ?? 0} />
      <rect
        className="hit"
        x={-half}
        y={bar ? -14 : -half}
        width={TILE}
        height={bar ? 28 : TILE}
      />
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
  // a busbar is a junction, not a thing: it goes unlabelled (the inspector has it)
  if (!s || BAR_KINDS.has(part.kind)) return null
  const [x, y] = cellToPx(part.at)
  const o = LABEL_OFFSET[part.labelSide ?? 'below']
  const r = readout(scene, part, s)
  return (
    <g
      className={dim ? 'labelGroup dim' : 'labelGroup'}
      transform={`translate(${x + o.dx} ${y + o.dy})`}
      pointerEvents="none"
    >
      <text className="label" textAnchor={o.anchor}>
        {part.label}
      </text>
      <text
        className={r.bad ? 'value bad' : 'value'}
        textAnchor={o.anchor}
        y={14}
      >
        {r.value}
      </text>
    </g>
  )
}

// ---- the drawing furniture -------------------------------------------------

/** the title on the left, the clock on the right */
function Header({
  scene,
  frame,
  w,
}: {
  scene: Scene
  frame: Frame
  w: number
}) {
  return (
    <g>
      <text className="title" x={PAD} y={38}>
        {scene.title}
      </text>
      <ClampedText
        className="sub"
        x={PAD}
        y={58}
        width={w * 0.62}
        text={scene.subtitle}
      />
      <text className="clock" x={w - PAD} y={38}>
        {clockTime(frame.hour)}
      </text>
      <text className="meta" x={w - PAD} y={58}>
        {`${scene.sheet} · day ${frame.day + 1}`}
      </text>
    </g>
  )
}

/** the legend's entries and where each starts, by an estimated text width */
function legendItems(scene: Scene) {
  const domains = [...new Set(scene.links.map((l) => l.domain))]
  let x = PAD
  const items = domains.map((d) => {
    const text = `${DOMAIN_NAMES[d]}${scene.units[d] ? ` · ${scene.units[d]!.rate}` : ''}`
    const at = x
    x += 20 + text.length * 6.2 + 22
    return { d, text, at }
  })
  return { items, end: x - 22 }
}

/** what each colour carries, along the bottom */
function Legend({ scene, h }: { scene: Scene; h: number }) {
  const y = h - FOOT_H / 2 - 4
  return (
    <g>
      {legendItems(scene).items.map(({ d, text, at }) => {
        return (
          <g key={d}>
            <line
              x1={at}
              y1={y}
              x2={at + 12}
              y2={y}
              stroke={`var(--${d})`}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <text className="legend" x={at + 20} y={y}>
              {text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/**
 * The maker's signature, bottom right on the legend's line, or tucked
 * under it when the legend runs that far. A link in the SVG file; the PNG
 * just carries the words.
 */
function Credit({ scene, w, h }: { scene: Scene; w: number; h: number }) {
  const x = w - PAD
  const fits = legendItems(scene).end + 24 + CREDIT.length * 5.6 <= x
  return (
    <a href={CREDIT_URL} target="_blank" rel="noopener">
      <text className="credit" x={x} y={fits ? h - FOOT_H / 2 : h - 8}>
        {CREDIT}
      </text>
    </a>
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
  const perLine = Math.max(10, Math.floor(width / 6.6))
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
        <tspan key={i} x={x} dy={i === 0 ? 0 : 16}>
          {l}
        </tspan>
      ))}
    </text>
  )
}
