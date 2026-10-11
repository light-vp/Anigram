// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PACKS, classOf } from '../packs/catalogue.ts'
import { PackSymbol } from '../packs/symbols.tsx'
import type { Frame } from '../sim/runtime.ts'
import type { LinkState } from '../sim/solver.ts'
import type { LineType, LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import { partDomain, rate, readout } from './format.ts'
import {
  FOOT_H,
  PAD,
  TILE,
  cellToPx,
  linkAnchor,
  roundedPath,
} from './geometry.ts'
import type { Pt } from './geometry.ts'
import { DOMAIN_NAMES } from './palette.ts'
import { LABEL_OFFSET } from './layout.ts'
import { LINE_NAMES, lineOf } from './lines.ts'
import type { Way } from './lines.ts'

/*
 * How a sheet draws when it follows an engineering practice (a P&ID, a
 * single-line): ink symbols with no tiles, lines drawn by what they stand
 * for, a flow arrow on every line, tags on the parts and numbers on the
 * lines. The simulation still runs underneath: arrows fill in while
 * something flows, valves and breakers show their state, and on screen the
 * flows still travel along the lines.
 */

export function EngLink({
  scene,
  link,
  pts,
  st,
  back,
  phase,
  animate,
  dim,
}: {
  scene: Scene
  link: LinkSpec
  pts: Pt[]
  st: LinkState | undefined
  /** the other half of a two-way pair, drawn on the same line */
  back?: LinkState
  phase: number
  animate: boolean
  dim: boolean
}) {
  const d = roundedPath(pts, 0)
  // a two-way line shows whichever way is flowing
  const reversed = (back?.flow ?? 0) > (st?.flow ?? 0)
  const flow = Math.max(st?.flow ?? 0, back?.flow ?? 0)
  const on = flow > 1e-6
  const line = lineOf(link)
  const ahead = linkAnchor(pts)
  const at = reversed ? { ...ahead, angle: ahead.angle + 180 } : ahead
  const [from, to] = [link.from, link.to]
    .map((id) => scene.parts.find((p) => p.id === id)!)
    .map((p) => p.tag ?? p.label)
  // the line number sits beside the arrow, reading along the line
  const upright = Math.abs(ahead.angle) > 90 ? ahead.angle - 180 : ahead.angle
  return (
    <g className={dim ? 'link dim' : 'link'}>
      <title>{`${reversed ? to : from} → ${reversed ? from : to}: ${rate(scene, link.domain, flow)} of ${DOMAIN_NAMES[link.domain]}`}</title>
      <path d={d} className={`route ${line}${link.loss ? ' loss' : ''}`} />
      {line === 'pneumatic' && <Slashes pts={pts} />}
      {on && animate && line !== 'signal' && line !== 'data' && (
        <path
          d={d}
          className="stream"
          stroke={`var(--${link.domain})`}
          strokeWidth={3}
          strokeDasharray="0 12"
          strokeDashoffset={(reversed ? 1 : -1) * phase * (12 / 14)}
        />
      )}
      {!link.loss && line !== 'signal' && line !== 'data' && (
        <path
          className={on ? 'arrow' : 'arrow idle'}
          d="M-5 -4 L4 0 L-5 4 Z"
          transform={`translate(${at.x} ${at.y}) rotate(${at.angle})`}
        />
      )}
      {link.tag && (
        <text
          className="lineNo"
          textAnchor="middle"
          transform={`translate(${at.x} ${at.y}) rotate(${upright}) translate(0 -9)`}
        >
          {link.tag}
        </text>
      )}
    </g>
  )
}

/** ISA's pneumatic signal: a pair of short slashes every so often along the line */
function Slashes({ pts }: { pts: Pt[] }) {
  const marks: string[] = []
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    const len = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / (len || 1)
    const uy = (y2 - y1) / (len || 1)
    for (let t = 40; t < len - 30; t += 40) {
      for (const o of [-2.5, 2.5]) {
        const cx = x1 + ux * (t + o)
        const cy = y1 + uy * (t + o)
        // a slash leans across the line
        const ax = cx + (-uy + ux) * 4
        const ay = cy + (ux + uy) * 4
        const bx = cx - (-uy + ux) * 4
        const by = cy - (ux + uy) * 4
        marks.push(`M${ax} ${ay} L${bx} ${by}`)
      }
    }
  }
  return <path className="ln thin" d={marks.join(' ')} />
}

export function EngPart({
  scene,
  part,
  frame,
  way,
  selected,
  dim,
  onClick,
}: {
  scene: Scene
  part: PartSpec
  frame: Frame
  way: Way
  selected: boolean
  dim: boolean
  onClick: () => void
}) {
  const s = frame.parts[part.id]
  if (!s) return null
  const [x, y] = cellToPx(part.at)
  const cls = classOf(part, scene)
  const info =
    cls && scene.drawing ? PACKS[scene.drawing]?.classes[cls] : undefined
  // inline symbols turn with their line; the ends of lines point the way it flows
  const turn = info?.inline
    ? way.vertical
      ? 'rotate(90)'
      : undefined
    : info?.terminal
      ? `rotate(${way.angle})`
      : undefined
  const half = TILE / 2
  return (
    <g
      className={['part', 'selectable', selected && 'selected', dim && 'dim']
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${x} ${y})`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <g transform={turn}>
        <PackSymbol
          cls={cls}
          name={part.class ?? part.kind}
          s={s}
          phase={frame.partPhase[part.id] ?? 0}
          part={part}
          symbols={scene.symbols ?? 'iec'}
        />
      </g>
      <rect className="hit" x={-half} y={-half} width={TILE} height={TILE} />
    </g>
  )
}

/** the tag in bold, then the name, then the live reading */
export function EngLabel({
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
  if (!s || classOf(part, scene) === 'Junction') return null
  const busbar = classOf(part, scene) === 'Busbar'
  const [x, y] = cellToPx(part.at)
  // a busbar's name sits above its left end, clear of the feeders below it
  const o = busbar
    ? { dx: -46, dy: part.tag ? -22 : -9, anchor: 'start' as const }
    : LABEL_OFFSET[part.labelSide ?? 'below']
  const r = sheetReadout(scene, part, frame)
  let line = 0
  return (
    <g
      className={dim ? 'labelGroup dim' : 'labelGroup'}
      transform={`translate(${x + o.dx} ${y + o.dy})`}
      pointerEvents="none"
    >
      {part.tag && (
        <text className="label tagLabel" textAnchor={o.anchor} y={14 * line++}>
          {part.tag}
        </text>
      )}
      <text className="label" textAnchor={o.anchor} y={14 * line++}>
        {part.label}
      </text>
      {!busbar && (
        <text
          className={r.bad ? 'value bad' : 'value'}
          textAnchor={o.anchor}
          y={14 * line}
        >
          {r.value}
        </text>
      )}
    </g>
  )
}

/**
 * the live reading, in what the sheet draws: a pump on a single-line reads
 * the power it draws, not the water it moves
 */
function sheetReadout(scene: Scene, part: PartSpec, frame: Frame) {
  const s = frame.parts[part.id]!
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  const own = partDomain(scene, part)
  if (!pack || pack.shows.includes(own)) return readout(scene, part, s)
  let d: LinkSpec['domain'] | undefined
  let flow = 0
  scene.links.forEach((l, i) => {
    if (!pack.shows.includes(l.domain)) return
    if (l.to !== part.id && l.from !== part.id) return
    d ??= l.domain
    if (l.domain === d && l.to === part.id) flow += frame.links[i]?.flow ?? 0
  })
  return d
    ? { value: rate(scene, d, flow), bad: false }
    : readout(scene, part, s)
}

/** what each kind of line means, along the bottom */
export function EngLegend({
  scene,
  links,
  h,
}: {
  scene: Scene
  links: LinkSpec[]
  h: number
}) {
  // on a single-line every line is a circuit
  const names: Record<LineType, string> =
    scene.drawing === 'single-line'
      ? { ...LINE_NAMES, process: 'circuit' }
      : LINE_NAMES
  // a loss is drawn dotted whatever its line, so it gets its own entry
  const types = [
    ...new Set(links.filter((l) => !l.loss).map(lineOf)),
    ...(links.some((l) => l.loss) ? (['loss'] as const) : []),
  ]
  const label = (t: (typeof types)[number]) =>
    t === 'loss' ? 'loss to surroundings' : names[t]
  const y = h - FOOT_H / 2 - 4
  let x = PAD
  return (
    <g>
      {types.map((t) => {
        const at = x
        x += 34 + label(t).length * 6.2 + 22
        return (
          <g key={t}>
            <path
              className={t === 'loss' ? 'route process loss' : `route ${t}`}
              d={`M${at} ${y} H${at + 26}`}
            />
            <text className="legend" x={at + 34} y={y}>
              {label(t)}
            </text>
          </g>
        )
      })}
    </g>
  )
}
