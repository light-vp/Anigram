// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PACKS, classOf } from '../packs/catalogue.ts'
import { PackSymbol } from '../packs/symbols.tsx'
import type { Frame } from '../sim/runtime.ts'
import type { LinkState } from '../sim/solver.ts'
import { describeTag, readingUnit, splitTag } from '../sim/instruments.ts'
import type {
  InstrumentSpec,
  LineType,
  LinkSpec,
  PartSpec,
  Scene,
} from '../sim/types.ts'
import { effortReadout, num, partDomain, rate, readout } from './format.ts'
import {
  ENG_FOOT_H,
  PAD,
  TILE,
  cellToPx,
  linkAnchor,
  roundedPath,
} from './geometry.ts'
import type { Pt } from './geometry.ts'
import { DOMAIN_NAMES } from './palette.ts'
import { LINE_NAMES, engLabelOffset, lineOf } from './lines.ts'
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
  if (isShaft(scene, link))
    return (
      <g className={dim ? 'link dim' : 'link'}>
        <title>{`${from} → ${to}: ${rate(scene, link.domain, flow)} through the shaft`}</title>
        <Shaft d={d} />
      </g>
    )
  return (
    <g className={dim ? 'link dim' : 'link'}>
      <title>{`${reversed ? to : from} → ${reversed ? from : to}: ${rate(scene, link.domain, flow)} of ${DOMAIN_NAMES[link.domain]}`}</title>
      <path d={d} className={`route ${line}${link.loss ? ' loss' : ''}`} />
      <LineMarks pts={pts} line={line} />
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
          transform={`translate(${at.x} ${at.y}) rotate(${upright}) translate(0 14)`}
        >
          {link.tag}
        </text>
      )}
    </g>
  )
}

/** a fluid-power circuit draws a motor's drive to its pump as a shaft */
const isShaft = (scene: Pick<Scene, 'drawing'>, link: LinkSpec) =>
  scene.drawing === 'fluid-power' && link.domain === 'mechanical'

/** a shaft: two fine parallel lines, ISO 1219's mechanical connection */
function Shaft({ d }: { d: string }) {
  return (
    <g>
      <path d={d} className="shaft" />
      <path d={d} className="shaftCore" />
    </g>
  )
}

/** the line types drawn with a mark repeated along them */
const MARKED = new Set<LineType>([
  'pneumatic',
  'hydraulic',
  'capillary',
  'electromagnetic',
])

/**
 * ISA-5.1's marks along a signal line, every so often: a pair of slashes for
 * pneumatic, a pair of Ls for hydraulic, a pair of crosses for a capillary
 * tube, a wave for an electromagnetic or sonic signal
 */
function LineMarks({
  pts,
  line,
  once,
}: {
  pts: Pt[]
  line: LineType
  /** one mark only, this far along: the legend's short sample */
  once?: number
}) {
  if (!MARKED.has(line)) return null
  const marks: string[] = []
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]!
    const [x2, y2] = pts[i]!
    const len = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / (len || 1)
    const uy = (y2 - y1) / (len || 1)
    const along = once !== undefined ? [once] : []
    if (once === undefined)
      for (let t = 40; t < len - 30; t += 40) along.push(t)
    for (const t of along) {
      // a point `a` along the line from the mark's centre and `b` across it
      const at = (a: number, b: number) =>
        `${+(x1 + ux * (t + a) - uy * b).toFixed(2)} ${+(y1 + uy * (t + a) + ux * b).toFixed(2)}`
      if (line === 'pneumatic')
        for (const o of [-2.5, 2.5])
          marks.push(`M${at(o + 4, 4)} L${at(o - 4, -4)}`)
      if (line === 'hydraulic')
        for (const o of [-4, 3])
          marks.push(`M${at(o, -6)} L${at(o, 1.5)} L${at(o + 3.5, 1.5)}`)
      if (line === 'capillary')
        for (const o of [-4, 4])
          marks.push(
            `M${at(o - 3, -3)} L${at(o + 3, 3)} M${at(o - 3, 3)} L${at(o + 3, -3)}`,
          )
      if (line === 'electromagnetic')
        marks.push(
          `M${at(-8, 0)} Q${at(-6, -6)} ${at(-4, 0)} Q${at(-2, 6)} ${at(0, 0)} Q${at(2, -6)} ${at(4, 0)} Q${at(6, 6)} ${at(8, 0)}`,
        )
    }
  }
  return <path className="ln thin" d={marks.join(' ')} />
}

export function EngPart({
  scene,
  part,
  frame,
  way,
  span,
  selected,
  dim,
  onClick,
}: {
  scene: Scene
  part: PartSpec
  frame: Frame
  way: Way
  /** a busbar's reach either side of its centre */
  span?: [number, number]
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
  // inline symbols turn with their line, and point along it if they have a
  // way round; the ends of lines point the way it flows
  const turn =
    info?.terminal || (info?.inline && info.directed)
      ? `rotate(${way.angle})`
      : info?.inline && way.vertical
        ? 'rotate(90)'
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
          span={span}
          domain={partDomain(scene, part)}
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
  span,
  dim,
}: {
  scene: Scene
  part: PartSpec
  frame: Frame
  span?: [number, number]
  dim: boolean
}) {
  const s = frame.parts[part.id]
  if (!s || classOf(part, scene) === 'Junction') return null
  const busbar = classOf(part, scene) === 'Busbar'
  const [x, y] = cellToPx(part.at)
  // a busbar's name sits above its left end, clear of the feeders below it
  const o = busbar
    ? {
        dx: (span?.[0] ?? -50) + 4,
        dy: part.tag ? -22 : -9,
        anchor: 'start' as const,
      }
    : engLabelOffset(scene, part)
  const r = sheetReadout(scene, part, frame)
  // a busbar's voltage is the one thing it reads
  const e = effortReadout(scene, part, s)
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
          y={14 * line++}
        >
          {r.value}
        </text>
      )}
      {e && (
        <text
          className={e.bad ? 'value effort bad' : 'value effort'}
          textAnchor={o.anchor}
          y={14 * line}
        >
          {e.value}
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
  also = [],
}: {
  scene: Scene
  links: LinkSpec[]
  h: number
  /** line types drawn by something other than a link: an instrument's signals */
  also?: LineType[]
}) {
  // on a single-line every line is a circuit; in a fluid-power circuit a
  // line works or pilots
  const names: Record<LineType, string> =
    scene.drawing === 'single-line'
      ? { ...LINE_NAMES, process: 'circuit' }
      : scene.drawing === 'fluid-power'
        ? {
            ...LINE_NAMES,
            process: 'working line',
            signal: 'pilot or drain line',
          }
        : LINE_NAMES
  // a loss is drawn dotted whatever its line, and a shaft as a shaft, so
  // each gets its own entry
  const lines = links.filter((l) => !l.loss && !isShaft(scene, l))
  const types = [
    ...new Set([...lines.map(lineOf), ...also]),
    ...(links.some((l) => l.loss) ? (['loss'] as const) : []),
    ...(links.some((l) => isShaft(scene, l)) ? (['shaft'] as const) : []),
  ]
  const label = (t: (typeof types)[number]) =>
    t === 'loss' ? 'loss to surroundings' : t === 'shaft' ? 'shaft' : names[t]
  // a column down the left of the foot, beside the title block
  const top = h - ENG_FOOT_H + 18
  return (
    <g>
      {types.map((t, i) => {
        const at = PAD
        const y = top + i * 16
        return (
          <g key={t}>
            {t === 'shaft' ? (
              <Shaft d={`M${at} ${y} H${at + 26}`} />
            ) : (
              <>
                <path
                  className={t === 'loss' ? 'route process loss' : `route ${t}`}
                  d={`M${at} ${y} H${at + 26}`}
                />
                {t !== 'loss' && (
                  <LineMarks
                    pts={[
                      [at, y],
                      [at + 26, y],
                    ]}
                    line={t}
                    once={13}
                  />
                )}
              </>
            )}
            <text className="legend" x={at + 34} y={y}>
              {label(t)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** an instrument's bubble radius */
const BUBBLE = 17

/** a line from an instrument to a part: down or up first, then across */
function wire(from: Pt, to: Pt): Pt[] {
  if (from[0] === to[0] || from[1] === to[1]) return [from, to]
  return [from, [from[0], to[1]], to]
}

/**
 * the lines an instrument hangs on: a thin process connection to what it
 * measures, and a signal line to what it drives
 */
export function InstrumentLines({
  scene,
  inst,
  dim,
}: {
  scene: Scene
  inst: InstrumentSpec
  dim: boolean
}) {
  const at = cellToPx(inst.at)
  const to = (id: string | undefined) => {
    const p = scene.parts.find((q) => q.id === id)
    return p ? cellToPx(p.at) : undefined
  }
  // fed by another instrument, the line to it is a signal, not a process connection
  const feeder = scene.instruments?.find((i) => i.tag === inst.measures)
  const measures = feeder ? cellToPx(feeder.at) : to(inst.measures)
  const drives = to(inst.drives)
  const line = inst.signal ?? 'signal'
  return (
    <g className={dim ? 'link dim' : 'link'}>
      {measures && (
        <path
          className={feeder ? 'route signal' : 'conn'}
          d={roundedPath(wire(at, measures), 0)}
        />
      )}
      {drives && (
        <>
          <path
            className={`route ${line}`}
            d={roundedPath(wire(at, drives), 0)}
          />
          <LineMarks pts={wire(at, drives)} line={line} />
        </>
      )}
    </g>
  )
}

/**
 * an ISA-5.1 bubble: the tag's letters over its loop number, with what
 * crosses it saying where it is (nothing in the field, a line on the control
 * panel, a dashed line behind it, a square for a DCS, a diamond for a PLC),
 * and its reading live beneath
 */
export function EngInstrument({
  scene,
  inst,
  frame,
  dim,
}: {
  scene: Scene
  inst: InstrumentSpec
  frame: Frame
  dim: boolean
}) {
  const [x, y] = cellToPx(inst.at)
  const { letters, loop } = splitTag(inst.tag)
  const m = inst.mounting ?? 'field'
  const R = BUBBLE
  const v = frame.instruments?.[inst.tag]
  const alarm =
    v !== undefined &&
    ((inst.low !== undefined && v < inst.low) ||
      (inst.high !== undefined && v > inst.high))
  const unit = readingUnit(inst, scene)
  return (
    <g
      className={dim ? 'instrument dim' : 'instrument'}
      transform={`translate(${x} ${y})`}
    >
      <title>{`${inst.tag}: ${describeTag(inst.tag)}`}</title>
      {(m === 'dcs' || m === 'plc') && (
        <rect x={-R} y={-R} width={2 * R} height={2 * R} className="ln sym" />
      )}
      {m === 'plc' ? (
        <path className="ln sym" d={`M0 ${-R} L${R} 0 L0 ${R} L${-R} 0 Z`} />
      ) : (
        <circle r={R} className={alarm ? 'ln sym alarmStroke' : 'ln sym'} />
      )}
      {m !== 'field' && (
        <path
          className={m === 'behind-panel' ? 'ln thin dashed' : 'ln thin'}
          d={`M${-R} 0 H${R}`}
        />
      )}
      <text className="bubbleText" y={-6}>
        {letters}
      </text>
      <text className="bubbleText" y={7}>
        {loop}
      </text>
      {v !== undefined && Number.isFinite(v) && (
        <text
          className={alarm ? 'value bad' : 'value'}
          // up and to the right, clear of the lines that leave the bubble
          x={R + 4}
          y={-R + 3}
        >
          {unit === '%' ? `${num(v)}%` : `${num(v)} ${unit}`.trim()}
        </text>
      )}
    </g>
  )
}
