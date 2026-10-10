// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useId } from 'react'
import type { ReactNode } from 'react'

import type { PartState } from '../sim/solver.ts'

/*
 * The parts library. Every glyph is a line drawing in a 36×36 box centred on
 * 0,0 — one stroke weight, round caps, no fills but colour that means
 * something (a level, a lit window, a glowing rod). The sheet sets each one
 * in a tile, so a glyph never draws its own frame.
 *
 * Glyphs read their motion off the simulation: `s` is the part's state this
 * instant, `phase` an angle in degrees that advances as fast as the part is
 * working. Nothing here keeps time of its own.
 */

export interface GlyphProps {
  s: PartState
  phase: number
}

export type Glyph = (props: GlyphProps) => ReactNode

const rad = (deg: number) => (deg * Math.PI) / 180
const cycle = (phase: number, period = 360) =>
  (((phase % period) + period) % period) / period
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** small rings rising from (x, y) and fading out */
function Puffs({
  x,
  y,
  phase,
  amount,
  n = 3,
  rise = 10,
}: {
  x: number
  y: number
  phase: number
  amount: number
  n?: number
  rise?: number
}) {
  if (amount < 0.02) return null
  return (
    <g className="puff">
      {Array.from({ length: n }, (_, i) => {
        const t = cycle(phase * 0.6 + (i * 360) / n)
        return (
          <circle
            key={i}
            cx={x + Math.sin(t * 5 + i) * 1.5}
            cy={y - t * rise}
            r={1.2 + t * 2}
            opacity={(1 - t) * clamp01(amount * 1.4)}
          />
        )
      })}
    </g>
  )
}

/** drops falling from y0 to y1 */
function Drops({
  xs,
  y0,
  y1,
  phase,
  amount,
}: {
  xs: number[]
  y0: number
  y1: number
  phase: number
  amount: number
}) {
  if (amount < 0.02) return null
  return (
    <g fill="var(--water)">
      {xs.map((x, i) => {
        const t = cycle(phase * 1.5 + i * 137)
        return (
          <circle
            key={i}
            cx={x}
            cy={y0 + (y1 - y0) * t}
            r={1.1}
            opacity={clamp01(amount * 1.5) * (1 - t * 0.5)}
          />
        )
      })}
    </g>
  )
}

/** rotor blades, as slim leaves */
function Blades({
  n,
  r,
  phase,
  w = 2.4,
  hub = 0,
}: {
  n: number
  r: number
  phase: number
  w?: number
  hub?: number
}) {
  return (
    <g transform={`rotate(${phase})`}>
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          className="ln solid"
          transform={`rotate(${(i * 360) / n})`}
          d={`M0 ${-hub} C ${w} ${-hub - r * 0.25}, ${w * 0.7} ${-r * 0.8}, 0 ${-r} C ${-w * 0.5} ${-r * 0.75}, ${-w * 0.6} ${-hub - r * 0.25}, 0 ${-hub} Z`}
        />
      ))}
    </g>
  )
}

/** windows: each lights once `level` passes its share */
function Windows({
  cells,
  level,
  size = 2.6,
}: {
  cells: Array<[number, number]>
  level: number
  size?: number
}) {
  return (
    <>
      {cells.map(([x, y], i) => {
        const on = level > (i + 0.5) / cells.length - 0.02
        return (
          <rect
            key={i}
            x={x - size / 2}
            y={y - size / 2}
            width={size}
            height={size}
            rx={0.6}
            className={on ? 'win on' : 'win'}
          />
        )
      })}
    </>
  )
}

/** a liquid surface at `y`, between x0 and x1, with a slow swell */
function surface(x0: number, x1: number, y: number, phase: number) {
  const w = Math.sin(rad(phase * 2)) * 0.8
  const mid = (x0 + x1) / 2
  return `M${x0} ${y} Q ${(x0 + mid) / 2} ${y - 1.2 + w} ${mid} ${y} T ${x1} ${y}`
}

/** clip children to a box, so a sliding pattern stops at the glyph's edge */
function Clipped({
  box: [x, y, w, h],
  children,
}: {
  box: [number, number, number, number]
  children: ReactNode
}) {
  const id = `clip${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <>
      <clipPath id={id}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  )
}

// ---- sources ------------------------------------------------------------

export const Sun: Glyph = ({ s, phase }) => {
  if (s.avail <= 0.001) {
    return (
      <path className="ln" d="M5 -12 A 12 12 0 1 0 12 5 A 9 9 0 0 1 5 -12 Z" />
    )
  }
  return (
    <g>
      <circle r={6.5} fill="var(--lit)" opacity={0.2 + 0.6 * s.activity} />
      <circle r={6.5} className="ln" />
      <g transform={`rotate(${phase * 0.1})`}>
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            className="ln"
            transform={`rotate(${i * 45})`}
            x1={0}
            y1={-10.5}
            x2={0}
            y2={-14.5}
          />
        ))}
      </g>
    </g>
  )
}

export const Wind: Glyph = ({ phase }) => (
  <g>
    <path className="ln" d="M-1 17 L-0.4 -5 M1 17 L0.4 -5 M-5 17 H5" />
    <g transform="translate(0 -6)">
      <Blades n={3} r={12} phase={phase * 1.4} w={2.2} hub={1.6} />
      <circle r={1.6} className="ln solid" />
    </g>
  </g>
)

export const SolarPanel: Glyph = ({ s }) => {
  const shine = s.avail > 0 ? 0.15 + 0.55 * clamp01(s.out / s.avail) : 0
  return (
    <g>
      <path d="M-15 -9 H10 L15 5 H-10 Z" fill="var(--light)" opacity={shine} />
      <path
        className="ln"
        d="M-15 -9 H10 L15 5 H-10 Z M-12.5 -2 H12.5 M-6.7 -9 L-1.7 5 M1.7 -9 L6.7 5 M0 5 V14 M-6 14 H6"
      />
    </g>
  )
}

export const GasWell: Glyph = () => (
  <g>
    <path
      className="ln"
      d="M-15 14 H15 M-3 14 V-4 M3 14 V-4 M-3 2 H-10 M3 2 H10 M-10 -1 V5 M10 -1 V5"
    />
    <circle cy={-8} r={4} className="ln" />
    <path className="ln" d="M-4 -8 H4 M0 -12 V-4" />
  </g>
)

export const Core: Glyph = ({ s, phase }) => {
  const glow = clamp01(0.2 + 0.7 * s.activity + 0.1 * Math.sin(rad(phase * 2)))
  return (
    <g>
      {[-5, 0, 5].map((x) => (
        <line
          key={x}
          x1={x}
          y1={-2}
          x2={x}
          y2={10}
          stroke="var(--heat)"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={glow}
        />
      ))}
      <path className="ln" d="M-12 14 V-3 A12 12 0 0 1 12 -3 V14 M-15 14 H15" />
    </g>
  )
}

export const GasPlant: Glyph = ({ s, phase }) => (
  <g>
    <Puffs x={12} y={-15} phase={phase} amount={s.activity} />
    <path
      className="ln"
      d="M-15 14 V-1 L-8 -6 V-1 L-1 -6 V-1 L6 -6 V14 M10 14 V-14 H14 V14 M-17 14 H17"
    />
    <Windows
      cells={[
        [-10, 6],
        [-4, 6],
        [2, 6],
      ]}
      level={s.activity}
    />
  </g>
)

export const Grid: Glyph = ({ s }) => (
  <g>
    <path
      className="ln"
      d="M-7 16 L-2 -13 H2 L7 16 M-11 -8 H11 M-8 -2 H8 M-11 -8 V-6 M11 -8 V-6 M-8 -2 V0 M8 -2 V0 M-4.6 3 H4.6 M-4.6 3 L6 16 M4.6 3 L-6 16"
    />
    <circle
      cy={-15.5}
      r={1.6}
      fill={s.activity > 0.02 ? 'var(--electric)' : 'none'}
      className="ln"
    />
  </g>
)

export const Rain: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="ln"
      d="M-11 2 A5.5 5.5 0 0 1 -10 -9 A8 8 0 0 1 5 -12 A6.5 6.5 0 0 1 12 2 Z"
    />
    <Drops
      xs={[-7, -2, 3, 8, -4.5, 5.5]}
      y0={6}
      y1={16}
      phase={phase}
      amount={s.activity}
    />
  </g>
)

export const Air: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.4) * 3
  return (
    <g className="ln" opacity={0.45 + 0.55 * s.activity}>
      <path d={`M${-15 + o} -6 H5 A4 4 0 1 0 1 -10`} />
      <path d={`M${-15 + o} 1 H13`} />
      <path d={`M${-15 + o} 8 H3 A4 4 0 1 1 -1 12`} />
    </g>
  )
}

// ---- conversion ---------------------------------------------------------

export const Transformer: Glyph = () => (
  <g className="ln">
    <circle cx={-5} r={8} />
    <circle cx={5} r={8} />
  </g>
)

export const Inverter: Glyph = () => (
  <g className="ln">
    <rect x={-13} y={-13} width={26} height={26} rx={3} />
    <path d="M-13 13 L13 -13" />
    <path d="M-9 -6 H-2" />
    <path d="M-9 -3 H-2" strokeDasharray="2 2" />
    <path d="M2 5 q 1.75 -3 3.5 0 t 3.5 0" />
  </g>
)

export const Turbine: Glyph = ({ phase }) => (
  <g>
    <circle r={14} className="ln" />
    <g transform={`rotate(${phase * 1.6})`} className="ln">
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} transform={`rotate(${i * 60})`} d="M0 -3 Q 5 -6 4 -11" />
      ))}
    </g>
    <circle r={2.4} className="ln" />
  </g>
)

/** a dot that orbits a rotor's rim, coloured while it works */
function Orbit({
  r,
  phase,
  on,
  cx = 0,
}: {
  r: number
  phase: number
  on: boolean
  cx?: number
}) {
  const a = rad(phase * 1.2)
  return (
    <circle
      cx={cx + Math.sin(a) * r}
      cy={-Math.cos(a) * r}
      r={1.8}
      fill={on ? 'var(--electric)' : 'var(--muted)'}
    />
  )
}

export const Generator: Glyph = ({ s, phase }) => (
  <g>
    <circle r={14} className="ln" />
    <text className="glyphText">G</text>
    <Orbit r={14} phase={phase} on={s.activity > 0.02} />
  </g>
)

export const TurboGen: Glyph = ({ s, phase }) => (
  <g>
    <path className="ln" d="M-17 -6 L-7 -10 V10 L-17 6 Z M-7 0 H1" />
    <circle cx={9} r={8} className="ln" />
    <text className="glyphText small" x={9}>
      G
    </text>
    <Orbit cx={9} r={8} phase={phase} on={s.activity > 0.02} />
  </g>
)

export const Pump: Glyph = ({ phase }) => (
  <g>
    <path className="ln" d="M-7 9 L-10 15 H10 L7 9 M0 -11 H15" />
    <circle r={11} className="ln" />
    <g transform={`rotate(${phase * 2})`} className="ln">
      {[0, 120, 240].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 -2 Q 4 -4 5 -8" />
      ))}
    </g>
  </g>
)

export const HeatPump: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-16} y={-12} width={32} height={24} rx={3} className="ln" />
    <circle cx={-5} r={7.5} className="ln" />
    <g transform="translate(-5 0)">
      <Blades n={4} r={6.5} phase={phase * 2} w={2.4} />
    </g>
    {[6, 9, 12].map((x) => (
      <line
        key={x}
        x1={x}
        y1={-7}
        x2={x}
        y2={7}
        className="ln"
        stroke="var(--heat)"
        opacity={0.3 + 0.7 * s.activity}
      />
    ))}
  </g>
)

export const Servers: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-11} y={-16} width={22} height={32} rx={2.5} className="ln" />
    <path className="ln" d="M-11 -8 H11 M-11 0 H11 M-11 8 H11" />
    {[-12, -4, 4, 12].map((y, i) => {
      const blink =
        Math.sin(rad(phase * (2 + i * 0.7) + i * 50)) > 1 - 2 * s.activity
      return (
        <g key={y}>
          <line className="ln thin" x1={-7} y1={y} x2={0} y2={y} />
          <circle
            cx={6}
            cy={y}
            r={1.3}
            fill={blink ? 'var(--data)' : 'var(--line)'}
          />
        </g>
      )
    })}
  </g>
)

// ---- carriers and switchgear -------------------------------------------

/** a busbar is drawn as a bar, not in a tile (see BAR_KINDS) */
export const Busbar: Glyph = ({ s }) => (
  <g>
    <rect x={-30} y={-3} width={60} height={6} rx={3} className="bar" />
    <line
      x1={-26}
      x2={26}
      stroke="var(--electric)"
      strokeWidth={2}
      strokeLinecap="round"
      opacity={s.activity > 0 ? 1 : 0}
    />
  </g>
)

export const Manifold: Glyph = ({ s }) => (
  <g>
    <rect x={-30} y={-3} width={60} height={6} rx={3} className="bar" />
    <line
      x1={-26}
      x2={26}
      stroke="var(--water)"
      strokeWidth={2}
      strokeLinecap="round"
      opacity={s.in > 1e-6 ? 1 : 0}
    />
  </g>
)

export const Breaker: Glyph = ({ s }) => {
  const closed = s.open > 0.5
  return (
    <g>
      <path className="ln" d="M-16 4 H-9 M9 4 H16" />
      <circle cx={-8} cy={4} r={1.8} className="inkf" />
      <circle cx={8} cy={4} r={1.8} className="inkf" />
      <line
        className="ln"
        x1={-8}
        y1={4}
        x2={closed ? 8 : 5}
        y2={closed ? 4 : -8}
        stroke={closed ? undefined : 'var(--alarm)'}
      />
    </g>
  )
}

export const Valve: Glyph = ({ s }) => (
  <g>
    <path
      d="M-12 -7 L12 7 V-7 L-12 7 Z"
      fill="var(--muted)"
      opacity={0.6 * (1 - s.open)}
    />
    <path className="ln" d="M-12 -7 L12 7 V-7 L-12 7 Z M0 0 V-12 M-5 -12 H5" />
  </g>
)

export const Pylon: Glyph = Grid

// ---- storage ------------------------------------------------------------

function levelColor(s: PartState, color: string) {
  return s.fill < 0.15 ? 'var(--alarm)' : color
}

export const Battery: Glyph = ({ s }) => {
  const h = 22 * s.fill
  const charging = s.in > s.out + 1e-6
  const discharging = s.out > s.in + 1e-6
  return (
    <g>
      <rect
        x={-6}
        y={13 - h}
        width={12}
        height={h}
        rx={1}
        fill={levelColor(s, 'var(--electric)')}
        opacity={0.85}
      />
      <rect x={-9} y={-12} width={18} height={28} rx={3} className="ln" />
      <path className="ln" d="M-3.5 -15 H3.5" />
      {(charging || discharging) && (
        <path
          className="ln thin"
          d={
            charging
              ? 'M14 4 V-6 M11.5 -3.5 L14 -6 L16.5 -3.5'
              : 'M14 -6 V4 M11.5 1.5 L14 4 L16.5 1.5'
          }
        />
      )}
    </g>
  )
}

export const Reservoir: Glyph = ({ s, phase }) => {
  const top = -9
  const bottom = 11
  const y = bottom - (bottom - top) * s.fill
  const half = 16 - 6 * ((y - top) / (bottom - top))
  return (
    <g>
      <path
        d={`${surface(-half, half, y, phase)} L 10 ${bottom} L -10 ${bottom} Z`}
        fill="var(--water)"
        opacity={0.35}
      />
      <path className="ln" d={`M-16 ${top} L-10 ${bottom} H10 L16 ${top}`} />
    </g>
  )
}

export const WaterTower: Glyph = ({ s, phase }) => {
  const h = 16 * s.fill
  return (
    <g>
      <path
        d={`${surface(-9, 9, 0 - h, phase)} L 9 0 L -9 0 Z`}
        fill={levelColor(s, 'var(--water)')}
        opacity={0.4}
      />
      <rect x={-10} y={-17} width={20} height={18} rx={2.5} className="ln" />
      <path className="ln" d="M-6 1 L-9 16 M6 1 L9 16 M-7.5 9 H7.5" />
    </g>
  )
}

export const HotTank: Glyph = ({ s }) => {
  const h = 26 * s.fill
  return (
    <g>
      <rect
        x={-6}
        y={13 - h}
        width={12}
        height={h}
        rx={2}
        fill="var(--heat)"
        opacity={0.15 + 0.5 * s.fill}
      />
      <rect x={-8} y={-15} width={16} height={30} rx={8} className="ln" />
    </g>
  )
}

export const FuelTank: Glyph = ({ s }) => {
  const h = 12 * s.fill
  return (
    <g>
      <rect
        x={-12}
        y={6 - h}
        width={24}
        height={h}
        rx={2}
        fill={levelColor(s, 'var(--fuel)')}
        opacity={0.4}
      />
      <rect x={-15} y={-8} width={30} height={16} rx={8} className="ln" />
      <path className="ln" d="M-8 8 L-10 15 M8 8 L10 15" />
    </g>
  )
}

// ---- water --------------------------------------------------------------

export const Well: Glyph = ({ s, phase }) => {
  const o = cycle(phase) * 6
  return (
    <g>
      <path className="ln" d="M-16 -7 H-4 M4 -7 H16 M-3 -16 V15 M3 -16 V15" />
      <path
        className="ln thin"
        d="M-14 -7 l-3 4 M-9 -7 l-3 4 M9 -7 l-3 4 M14 -7 l-3 4"
      />
      <Clipped box={[-16, 6, 32, 8]}>
        <path
          className="ln"
          stroke="var(--water)"
          opacity={0.4 + 0.6 * s.activity}
          d={`M${-22 + o} 10 q 1.5 -2 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0 t 3 0`}
        />
      </Clipped>
    </g>
  )
}

export const Treatment: Glyph = ({ s, phase }) => (
  <g>
    <rect
      x={-11}
      y={-11}
      width={22}
      height={13}
      rx={1.5}
      fill="var(--water)"
      opacity={0.25}
    />
    <rect x={-13} y={-13} width={26} height={26} rx={3} className="ln" />
    <path className="ln thin" d="M-13 3 H13 M-13 7 H13" strokeDasharray="2 2" />
    {s.activity > 0.02 &&
      [-6, 0, 6].map((x, i) => {
        const t = cycle(phase * 0.9 + i * 120)
        return (
          <circle
            key={x}
            cx={x + Math.sin(t * 7) * 1}
            cy={0 - t * 10}
            r={1.1}
            className="ln thin"
            opacity={1 - t}
          />
        )
      })}
  </g>
)

export const Tap: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="ln"
      d="M-15 -3 H3 A6 6 0 0 1 9 3 V6 M-4 -3 V-9 M-9 -9 H1"
    />
    <Drops xs={[9, 9, 9]} y0={9} y1={17} phase={phase} amount={s.activity} />
  </g>
)

export const Hydrant: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="ln"
      d="M-6 15 V-3 A6 6 0 0 1 6 -3 V15 M-9 15 H9 M-8 -3 H8"
    />
    <circle cy={5} r={2.4} className="ln" />
    {s.activity > 0.02 &&
      [0, 1, 2].map((i) => {
        const t = cycle(phase * 2 + i * 120)
        return (
          <circle
            key={i}
            cx={8 + t * 9}
            cy={3 - Math.sin(t * Math.PI) * 6 + t * 8}
            r={1.2}
            fill="var(--water)"
            opacity={1 - t * 0.6}
          />
        )
      })}
  </g>
)

export const River: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.8) * 8
  return (
    <Clipped box={[-16, -12, 32, 24]}>
      <g className="ln" stroke="var(--water)" opacity={s.in > 0 ? 1 : 0.4}>
        {[-7, 0, 7].map((y, i) => (
          <path
            key={y}
            d={`M${-24 + ((o + i * 3) % 8)} ${y} q 2 -2.5 4 0 t 4 0 t 4 0 t 4 0 t 4 0 t 4 0 t 4 0 t 4 0 t 4 0 t 4 0`}
          />
        ))}
      </g>
    </Clipped>
  )
}

export const Weir: Glyph = ({ s, phase }) => (
  <g>
    <path className="ln" d="M-16 -12 H-8 V-4 H0 V4 H8 V12 H16" />
    {s.in > 1e-4 &&
      [0, 1, 2, 3].map((i) => {
        const t = cycle(phase * 2 + i * 90)
        return (
          <circle
            key={i}
            cx={-12 + t * 26}
            cy={-15 + t * 25}
            r={1.2}
            fill="var(--water)"
            opacity={1 - t * 0.5}
          />
        )
      })}
  </g>
)

// ---- demand -------------------------------------------------------------

export const House: Glyph = ({ s }) => (
  <g>
    <path className="ln" d="M-14 0 L0 -13 L14 0 M-10 -3.5 V14 H10 V-3.5" />
    <path className="ln" d="M-2.5 14 V8 H2.5 V14" />
    <Windows
      cells={[
        [-5, 1],
        [5, 1],
      ]}
      level={s.activity}
      size={3.6}
    />
  </g>
)

export const City: Glyph = ({ s }) => (
  <g>
    <path
      className="ln"
      d="M-17 15 V1 H-10 V-7 H-3 V-15 H4 V-4 H10 V-10 H17 V15 M-17 15 H17"
    />
    <Windows
      cells={[
        [-13.5, 6],
        [-6.5, -2],
        [-6.5, 6],
        [0.5, -10],
        [0.5, -3],
        [0.5, 4],
        [0.5, 10],
        [7, 2],
        [7, 9],
        [13.5, -5],
        [13.5, 3],
      ]}
      level={s.activity}
    />
  </g>
)

export const Hospital: Glyph = ({ s }) => (
  <g>
    <path className="ln" d="M-14 15 V-5 H-5 V-14 H5 V-5 H14 V15 Z" />
    <path
      d="M0 -12 V-7 M-2.5 -9.5 H2.5"
      stroke="var(--alarm)"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
    <path className="ln" d="M-2.5 15 V10 H2.5 V15" />
    <Windows
      cells={[
        [-9, 0],
        [-3, 0],
        [3, 0],
        [9, 0],
        [-9, 6],
        [9, 6],
      ]}
      level={s.activity}
    />
  </g>
)

export const Factory: Glyph = ({ s, phase }) => (
  <g>
    <Puffs x={12.5} y={-15} phase={phase} amount={s.activity * 0.8} />
    <path
      className="ln"
      d="M-16 15 V-1 L-9 -6 V-1 L-2 -6 V-1 L5 -6 V-1 H10 V-15 H15 V15 Z"
    />
    <g transform={`translate(-6 7) rotate(${phase})`} className="ln">
      <circle r={3.5} />
      {[0, 60, 120].map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d="M0 -5.5 V-3.5 M0 3.5 V5.5"
        />
      ))}
    </g>
    <Windows
      cells={[
        [3, 6],
        [9, 6],
      ]}
      level={s.activity}
    />
  </g>
)

export const Radiator: Glyph = ({ s }) => (
  <g>
    {[-12, -6, 0, 6, 12].map((x) => (
      <rect
        key={`h${x}`}
        x={x - 2}
        y={-11}
        width={4}
        height={22}
        rx={2}
        fill="var(--heat)"
        opacity={0.06 + 0.5 * s.activity}
      />
    ))}
    {[-12, -6, 0, 6, 12].map((x) => (
      <rect
        key={x}
        x={x - 2}
        y={-11}
        width={4}
        height={22}
        rx={2}
        className="ln"
      />
    ))}
    <path className="ln" d="M-16 -7 H-14 M14 -7 H16 M-12 15 V11 M12 15 V11" />
  </g>
)

export const Car: Glyph = ({ s }) => (
  <g>
    <path
      className="ln"
      d="M-16 8 V2 L-12 0 L-7 -6 H6 L11 0 L16 2 V8 H12 M6 8 H-6 M-12 8 H-16 M-6 -6 L-8 0 H11 M0 -6 V0"
    />
    <circle cx={-9} cy={8} r={3} className="ln" />
    <circle cx={9} cy={8} r={3} className="ln" />
    {s.activity > 0.02 && (
      <path
        d="M2 -16 L-2 -11 H1 L-1 -7 L4 -12 H1 Z"
        fill="var(--electric)"
        stroke="var(--electric)"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
    )}
  </g>
)

export const Globe: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.3)
  return (
    <g>
      <g className="ln">
        <circle r={13} />
        <ellipse rx={5.5} ry={13} />
        <path d="M-13 0 H13 M-11 -6.5 H11 M-11 6.5 H11" />
      </g>
      {s.activity > 0.02 &&
        [0, 1, 2].map((i) => {
          const a = rad((o + i / 3) * 360)
          return (
            <circle
              key={i}
              cx={Math.cos(a) * 16}
              cy={Math.sin(a) * 16}
              r={1.4}
              fill="var(--data)"
            />
          )
        })}
    </g>
  )
}

// ---- where waste goes ---------------------------------------------------

export const CoolingTower: Glyph = ({ s, phase }) => (
  <g>
    <Puffs
      x={0}
      y={-13}
      phase={phase}
      amount={s.in > 0 ? 0.4 + s.activity : 0}
      n={4}
      rise={6}
    />
    <path className="ln" d="M-11 15 Q -5 0 -7 -12 H7 Q 5 0 11 15 M-15 15 H15" />
  </g>
)

export const Sky: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.5)
  return (
    <g>
      {[-7, 0, 7].map((x, i) => {
        const t = (o + i / 3) % 1
        return (
          <path
            key={x}
            className="ln"
            stroke="var(--heat)"
            opacity={s.in > 0 ? 0.3 + 0.6 * (1 - t) : 0.2}
            d={`M${x} 13 q -3 -4 0 -8 t 0 -8 t 0 -8`}
            transform={`translate(0 ${-t * 4})`}
          />
        )
      })}
    </g>
  )
}

export const Fan: Glyph = ({ phase }) => (
  <g>
    <rect x={-14} y={-14} width={28} height={28} rx={4} className="ln" />
    <circle r={10.5} className="ln" />
    <Blades n={4} r={9} phase={phase * 2.4} w={3} />
  </g>
)

export const Generic: Glyph = () => <circle r={10} className="ln" />
