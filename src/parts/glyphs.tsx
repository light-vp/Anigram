// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ReactNode } from 'react'

import type { PartState } from '../sim/solver.ts'

/*
 * The parts library. Each glyph is drawn in a 72×72 box centred on 0,0 with
 * the sheet's ink classes (see view/sheetStyle.ts), and reads its motion off
 * the simulation: `s` is the part's state this instant, `phase` an angle in
 * degrees that advances as fast as the part is working. Nothing here keeps
 * time of its own.
 */

export interface GlyphProps {
  s: PartState
  phase: number
}

export type Glyph = (props: GlyphProps) => ReactNode

const rad = (deg: number) => (deg * Math.PI) / 180
const cycle = (phase: number, period = 360) =>
  (((phase % period) + period) % period) / period

/** n puffs rising from (x, y), spaced along one cycle */
function Puffs({
  x,
  y,
  phase,
  amount,
  n = 3,
  rise = 26,
  r = 5,
  cls = 'puff',
}: {
  x: number
  y: number
  phase: number
  amount: number
  n?: number
  rise?: number
  r?: number
  cls?: string
}) {
  if (amount < 0.02) return null
  return (
    <g className={cls}>
      {Array.from({ length: n }, (_, i) => {
        const t = cycle(phase * 0.6 + (i * 360) / n)
        return (
          <circle
            key={i}
            cx={x + Math.sin(t * 6 + i) * 3}
            cy={y - t * rise}
            r={r * (0.6 + t * 0.9)}
            opacity={(1 - t) * Math.min(1, amount * 1.4)}
          />
        )
      })}
    </g>
  )
}

/** n drops falling from y0 to y1 */
function Drops({
  xs,
  y0,
  y1,
  phase,
  amount,
  color = 'var(--water)',
}: {
  xs: number[]
  y0: number
  y1: number
  phase: number
  amount: number
  color?: string
}) {
  if (amount < 0.02) return null
  return (
    <g fill={color}>
      {xs.map((x, i) => {
        const t = cycle(phase * 1.5 + i * 137)
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y0 + (y1 - y0) * t}
            rx={1.8}
            ry={2.8}
            opacity={Math.min(1, amount * 1.5)}
          />
        )
      })}
    </g>
  )
}

function Blades({
  n,
  r,
  phase,
  w = 5,
}: {
  n: number
  r: number
  phase: number
  w?: number
}) {
  return (
    <g transform={`rotate(${phase})`}>
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          className="body"
          transform={`rotate(${(i * 360) / n})`}
          d={`M0 0 C ${w} ${-r * 0.3}, ${w * 0.8} ${-r * 0.8}, 0 ${-r} C ${-w * 0.4} ${-r * 0.7}, ${-w * 0.6} ${-r * 0.3}, 0 0 Z`}
        />
      ))}
    </g>
  )
}

/** lit windows: each window lights once `level` passes its threshold */
function Windows({
  cells,
  level,
}: {
  cells: Array<[number, number, number, number]>
  level: number
}) {
  return (
    <>
      {cells.map(([x, y, w, h], i) => {
        const on = level > (i + 0.5) / cells.length - 0.02
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            className={on ? 'win on' : 'win'}
          />
        )
      })}
    </>
  )
}

// ---- sources ------------------------------------------------------------

export const Sun: Glyph = ({ s, phase }) => {
  if (s.avail <= 0.001) {
    return (
      <g>
        <path
          className="body"
          d="M8 -16 A 18 18 0 1 0 8 16 A 13 13 0 1 1 8 -16 Z"
        />
        <circle cx={18} cy={-12} r={1.4} className="inkf" />
        <circle cx={-20} cy={18} r={1} className="inkf" />
        <circle cx={22} cy={14} r={1.2} className="inkf" />
      </g>
    )
  }
  const a = Math.min(1, s.avail / Math.max(s.avail, 1e-9))
  return (
    <g>
      <g transform={`rotate(${phase * 0.15})`}>
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            className="ln"
            transform={`rotate(${i * 30})`}
            x1={0}
            y1={-20}
            x2={0}
            y2={i % 2 ? -27 : -32}
          />
        ))}
      </g>
      <circle r={15} className="body" />
      <circle r={15} fill="var(--lit)" opacity={0.35 + 0.65 * a * s.activity} />
    </g>
  )
}

export const Wind: Glyph = ({ phase }) => (
  <g>
    <path className="body" d="M-3 34 L-1.5 -6 L1.5 -6 L3 34 Z" />
    <line className="ln" x1={-12} y1={34} x2={12} y2={34} />
    <g transform="translate(0 -8)">
      <Blades n={3} r={28} phase={phase * 1.4} w={4} />
      <circle r={3.5} className="body" />
    </g>
  </g>
)

export const SolarPanel: Glyph = ({ s }) => {
  const shine =
    0.12 +
    0.7 *
      (s.avail > 0
        ? Math.min(1, s.out / Math.max(s.avail, 1e-9)) * 0.4 + 0.6
        : 0) *
      Math.min(1, s.avail > 0 ? 1 : 0)
  const cells: ReactNode[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x0 = -28 + c * 13 + r * 4
      const y0 = -18 + r * 9
      cells.push(
        <path
          key={`${r}${c}`}
          d={`M${x0} ${y0} h12 l4 8 h-12 Z`}
          fill="var(--water)"
          opacity={s.avail > 0 ? shine : 0.12}
          stroke="var(--ink)"
          strokeWidth={0.8}
        />,
      )
    }
  }
  return (
    <g>
      <path className="body" d="M-30 -20 L24 -20 L36 8 L-18 8 Z" />
      {cells}
      <line className="ln" x1={0} y1={8} x2={-2} y2={30} />
      <line className="ln" x1={18} y1={8} x2={20} y2={30} />
      <line className="ln" x1={-12} y1={30} x2={30} y2={30} />
    </g>
  )
}

export const GasWell: Glyph = ({ s, phase }) => (
  <g>
    <line className="ln" x1={-30} y1={30} x2={30} y2={30} />
    <path
      className="hatch"
      d="M-26 30 l-6 6 M-14 30 l-6 6 M-2 30 l-6 6 M10 30 l-6 6 M22 30 l-6 6"
    />
    <rect x={-5} y={-12} width={10} height={42} className="body" />
    <rect x={-14} y={-4} width={28} height={7} rx={2} className="body" />
    <circle cx={0} cy={-16} r={7} className="body" />
    <line className="ln" x1={-7} y1={-16} x2={7} y2={-16} />
    <line className="ln" x1={0} y1={-23} x2={0} y2={-9} />
    {s.activity > 0.02 && (
      <path
        d="M14 -4 q 8 -3 10 -12 q 4 8 -2 14 Z"
        fill="var(--heat)"
        opacity={0.5 + 0.5 * Math.abs(Math.sin(rad(phase * 3)))}
      />
    )}
  </g>
)

export const Core: Glyph = ({ s, phase }) => {
  const glow = 0.25 + 0.6 * s.activity + 0.15 * Math.sin(rad(phase * 2))
  return (
    <g>
      <path
        className="body"
        d="M-20 -26 Q 0 -36 20 -26 L 20 26 Q 0 34 -20 26 Z"
      />
      {[-11, -4, 3, 10].map((x) => (
        <rect
          key={x}
          x={x - 2}
          y={-18}
          width={4}
          height={34}
          fill="var(--heat)"
          opacity={glow}
        />
      ))}
      <path className="ln" d="M-20 -26 Q 0 -16 20 -26" />
      <line className="ln" x1={-28} y1={30} x2={28} y2={30} />
    </g>
  )
}

export const GasPlant: Glyph = ({ s, phase }) => (
  <g>
    <Puffs x={16} y={-26} phase={phase} amount={s.activity} />
    <rect x={10} y={-26} width={11} height={56} className="body" />
    <line className="ln" x1={10} y1={-18} x2={21} y2={-18} />
    <path
      className="body"
      d="M-32 30 L-32 -2 L-16 -12 L-16 -2 L0 -12 L0 -2 L10 -8 L10 30 Z"
    />
    <Windows
      cells={[
        [-27, 8, 7, 7],
        [-15, 8, 7, 7],
        [-3, 8, 7, 7],
      ]}
      level={s.activity}
    />
    <line className="ln" x1={-36} y1={30} x2={30} y2={30} />
  </g>
)

export const Grid: Glyph = ({ s }) => (
  <g>
    <path
      className="ln"
      d="M-16 32 L-5 -26 L5 -26 L16 32 M-12 12 L12 12 M-9 -4 L9 -4 M-16 32 L9 -4 M16 32 L-9 -4 M-12 12 L5 -26 M12 12 L-5 -26"
    />
    <line className="ln" x1={-24} y1={-18} x2={24} y2={-18} />
    <line className="ln" x1={-18} y1={-8} x2={18} y2={-8} />
    {[-24, -18, 18, 24].map((x) => (
      <line
        key={x}
        className="ln thin"
        x1={x}
        y1={x * x > 400 ? -18 : -8}
        x2={x}
        y2={(x * x > 400 ? -18 : -8) + 5}
      />
    ))}
    <circle
      cx={0}
      cy={-30}
      r={3}
      fill={s.activity > 0.02 ? 'var(--electric)' : 'var(--paper)'}
      stroke="var(--ink)"
      strokeWidth={1.4}
    />
  </g>
)

export const Rain: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="body"
      d="M-24 4 a10 10 0 0 1 4 -19 a13 13 0 0 1 24 -5 a10 10 0 0 1 16 8 a8 8 0 0 1 2 16 Z"
    />
    <Drops
      xs={[-16, -6, 4, 14, -11, 9]}
      y0={8}
      y1={34}
      phase={phase}
      amount={s.activity}
    />
  </g>
)

export const Air: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.5) * 12
  return (
    <g>
      <circle r={28} className="body dashed" />
      {[-12, 0, 12].map((y, i) => (
        <path
          key={y}
          className="ln"
          stroke="var(--heat)"
          opacity={0.35 + 0.65 * s.activity}
          d={`M${-20 + ((o + i * 4) % 12) - 6} ${y} q 5 -5 10 0 t 10 0 t 10 0`}
        />
      ))}
    </g>
  )
}

// ---- conversion ---------------------------------------------------------

export const Transformer: Glyph = ({ s }) => (
  <g>
    <circle cx={-9} r={15} className="body" />
    <circle cx={9} r={15} className="body" fillOpacity={0.6} />
    <circle cx={-9} r={15} className="ln" />
    <path
      className="ln thin"
      d="M-18 -4 q3 -6 6 0 t6 0 t6 0"
      opacity={0.5 + 0.5 * s.activity}
    />
    <path
      className="ln thin"
      d="M4 4 q2 -4 4 0 t4 0 t4 0 t4 0"
      opacity={0.5 + 0.5 * s.activity}
    />
  </g>
)

export const Inverter: Glyph = () => (
  <g>
    <rect x={-24} y={-24} width={48} height={48} rx={4} className="body" />
    <line className="ln" x1={-24} y1={24} x2={24} y2={-24} />
    <line className="ln" x1={-17} y1={-12} x2={-5} y2={-12} />
    <line
      className="ln"
      x1={-17}
      y1={-7}
      x2={-5}
      y2={-7}
      strokeDasharray="3 2"
    />
    <path className="ln" d="M5 10 q3 -6 6 0 t6 0" />
  </g>
)

export const Turbine: Glyph = ({ phase }) => (
  <g>
    <circle r={26} className="body" />
    <Blades n={6} r={22} phase={phase * 1.6} w={7} />
    <circle r={5} className="inkf" />
  </g>
)

export const Generator: Glyph = ({ s, phase }) => (
  <g>
    <circle r={26} className="body" />
    <g transform={`rotate(${phase * 1.2})`}>
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          className="ln thin"
          transform={`rotate(${i * 30})`}
          x1={0}
          y1={-21}
          x2={0}
          y2={-26}
        />
      ))}
    </g>
    <text className="glyphText" y={-2}>
      G
    </text>
    <path
      className="ln thin"
      d="M-9 9 q 4.5 -7 9 0 t 9 0"
      stroke="var(--electric)"
      opacity={0.4 + 0.6 * s.activity}
    />
  </g>
)

export const TurboGen: Glyph = ({ s, phase }) => (
  <g>
    <path className="body" d="M-34 -14 L-8 -20 L-8 20 L-34 14 Z" />
    <g transform="translate(-21 0) scale(0.45)">
      <Blades n={6} r={22} phase={phase * 1.6} w={7} />
    </g>
    <line className="ln" x1={-8} y1={0} x2={4} y2={0} />
    <circle cx={18} r={15} className="body" />
    <text className="glyphText" x={18} y={-1} style={{ fontSize: 12 }}>
      G
    </text>
    <path
      className="ln thin"
      d="M12 6 q 3 -5 6 0 t 6 0"
      stroke="var(--electric)"
      opacity={0.4 + 0.6 * s.activity}
    />
  </g>
)

export const Pump: Glyph = ({ phase }) => (
  <g>
    <path className="body" d="M-24 26 L-16 14 L16 14 L24 26 Z" />
    <circle r={20} className="body" />
    <g transform={`rotate(${phase * 2})`}>
      {[0, 120, 240].map((a) => (
        <path
          key={a}
          className="ln"
          transform={`rotate(${a})`}
          d="M0 0 q 10 -2 14 -12"
        />
      ))}
    </g>
    <circle r={4} className="inkf" />
    <path className="body" d="M14 -14 h18 v10 h-12" />
  </g>
)

export const HeatPump: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-30} y={-24} width={60} height={48} rx={4} className="body" />
    <circle cx={-8} r={16} className="ln" />
    <g transform={`translate(-8 0)`}>
      <Blades n={4} r={14} phase={phase * 2} w={6} />
    </g>
    <path
      className="ln"
      d="M14 -14 v28 M10 -10 h8 M10 10 h8"
      stroke="var(--water)"
    />
    <path
      d="M22 8 q -6 -6 0 -14 q 6 6 0 14"
      fill="var(--heat)"
      opacity={0.3 + 0.7 * s.activity}
    />
  </g>
)

export const Servers: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-22} y={-32} width={44} height={64} rx={3} className="body" />
    {Array.from({ length: 6 }, (_, i) => {
      const y = -26 + i * 10
      const blink =
        Math.sin(rad(phase * (2 + i * 0.7) + i * 50)) > 1 - 2 * s.activity
      return (
        <g key={i}>
          <rect x={-17} y={y} width={34} height={7} className="ln thin" />
          <circle
            cx={11}
            cy={y + 3.5}
            r={1.6}
            fill={blink ? 'var(--data)' : 'var(--muted)'}
          />
          <line className="ln thin" x1={-13} y1={y + 3.5} x2={2} y2={y + 3.5} />
        </g>
      )
    })}
  </g>
)

// ---- carriers and switchgear -------------------------------------------

export const Busbar: Glyph = ({ s }) => (
  <g>
    <rect x={-34} y={-5} width={68} height={10} rx={2} className="inkf" />
    <rect
      x={-30}
      y={-1.5}
      width={60}
      height={3}
      fill="var(--electric)"
      opacity={s.activity > 0 ? 0.9 : 0.15}
    />
  </g>
)

export const Manifold: Glyph = () => (
  <g>
    <rect x={-30} y={-9} width={60} height={18} rx={9} className="body" />
    <rect
      x={-26}
      y={-4}
      width={52}
      height={8}
      rx={4}
      fill="var(--water)"
      opacity={0.6}
    />
  </g>
)

export const Breaker: Glyph = ({ s }) => {
  const closed = s.open > 0.5
  return (
    <g className="clicky">
      <rect x={-26} y={-20} width={52} height={40} rx={6} className="body" />
      <circle cx={-14} cy={6} r={3.5} className="inkf" />
      <circle cx={14} cy={6} r={3.5} className="inkf" />
      <line
        className="ln"
        strokeWidth={3}
        x1={-14}
        y1={6}
        x2={closed ? 14 : 8}
        y2={closed ? 6 : -12}
        stroke={closed ? 'var(--ink)' : 'var(--alarm)'}
      />
      <text className="glyphText small" y={15} x={0}>
        {closed ? '' : 'OPEN'}
      </text>
    </g>
  )
}

export const Valve: Glyph = ({ s }) => {
  const open = s.open
  return (
    <g className="clicky">
      <path className="body" d="M-20 -14 L0 0 L-20 14 Z" fillOpacity={1} />
      <path className="body" d="M20 -14 L0 0 L20 14 Z" />
      <path
        d="M-20 -14 L0 0 L-20 14 Z M20 -14 L0 0 L20 14 Z"
        className="inkf"
        opacity={1 - open}
      />
      <line className="ln" x1={0} y1={0} x2={0} y2={-20} />
      <line className="ln" x1={-9} y1={-22} x2={9} y2={-22} strokeWidth={3} />
    </g>
  )
}

export const Pylon: Glyph = Grid

// ---- storage ------------------------------------------------------------

export const Battery: Glyph = ({ s }) => {
  const h = 46 * s.fill
  const charging = s.in > s.out + 1e-6
  const discharging = s.out > s.in + 1e-6
  return (
    <g>
      <rect x={-7} y={-30} width={14} height={6} rx={1.5} className="inkf" />
      <rect x={-18} y={-25} width={36} height={52} rx={4} className="body" />
      <rect
        x={-14}
        y={23 - h}
        width={28}
        height={h}
        fill={s.fill < 0.15 ? 'var(--alarm)' : 'var(--electric)'}
        opacity={0.85}
      />
      <rect x={-18} y={-25} width={36} height={52} rx={4} className="ln" />
      {(charging || discharging) && (
        <path
          className="ln"
          d={
            charging
              ? 'M26 8 L26 -12 M21 -6 L26 -12 L31 -6'
              : 'M26 -12 L26 8 M21 2 L26 8 L31 2'
          }
        />
      )}
    </g>
  )
}

export const Reservoir: Glyph = ({ s, phase }) => {
  const top = -18
  const bottom = 24
  const y = bottom - (bottom - top) * s.fill
  const k = (y - top) / (bottom - top)
  const half = 34 - 10 * k
  const w = Math.sin(rad(phase * 2)) * 1.5
  return (
    <g>
      <path
        d={`M${-half} ${y} q ${half / 2} ${-3 + w} ${half} 0 t ${half} 0 L 24 ${bottom} L -24 ${bottom} Z`}
        fill="var(--water)"
        opacity={0.55}
      />
      <path
        className="ln"
        d={`M-34 ${top} L-24 ${bottom} L24 ${bottom} L34 ${top}`}
      />
      <path
        className="hatch"
        d="M-34 -18 l-4 5 M-31 -10 l-4 5 M-28 -2 l-4 5 M-25 6 l-4 5 M34 -18 l4 5 M31 -10 l4 5 M28 -2 l4 5 M25 6 l4 5"
      />
    </g>
  )
}

export const WaterTower: Glyph = ({ s, phase }) => {
  const h = 30 * s.fill
  const w = Math.sin(rad(phase * 2)) * 1.2
  return (
    <g>
      <path
        className="ln"
        d="M-14 8 L-20 34 M14 8 L20 34 M-16 18 L16 18 M-18 26 L18 26 M-15 18 L17 26 M15 18 L-17 26"
      />
      <rect x={-22} y={-26} width={44} height={34} rx={4} className="body" />
      <path
        d={`M-20 ${6 - h} q 10 ${-2 + w} 20 0 t 20 0 L 20 6 L -20 6 Z`}
        fill="var(--water)"
        opacity={0.6}
      />
      <rect x={-22} y={-26} width={44} height={34} rx={4} className="ln" />
      <path className="body" d="M-24 -26 L0 -36 L24 -26 Z" />
    </g>
  )
}

export const HotTank: Glyph = ({ s }) => {
  const h = 52 * s.fill
  return (
    <g>
      <rect x={-16} y={-28} width={32} height={58} rx={14} className="body" />
      <rect
        x={-12}
        y={26 - h}
        width={24}
        height={h}
        rx={4}
        fill="var(--heat)"
        opacity={0.25 + 0.5 * s.fill}
      />
      <rect x={-16} y={-28} width={32} height={58} rx={14} className="ln" />
    </g>
  )
}

export const FuelTank: Glyph = ({ s }) => {
  const h = 30 * s.fill
  return (
    <g>
      <rect x={-28} y={-16} width={56} height={34} rx={17} className="body" />
      <rect
        x={-24}
        y={14 - h}
        width={48}
        height={h}
        rx={3}
        fill="var(--fuel)"
        opacity={0.6}
      />
      <rect x={-28} y={-16} width={56} height={34} rx={17} className="ln" />
      <line className="ln" x1={-18} y1={18} x2={-22} y2={30} />
      <line className="ln" x1={18} y1={18} x2={22} y2={30} />
    </g>
  )
}

// ---- water --------------------------------------------------------------

export const Well: Glyph = ({ s, phase }) => {
  const o = cycle(phase) * 8
  return (
    <g>
      <line className="ln" x1={-32} y1={-14} x2={32} y2={-14} />
      <path
        className="hatch"
        d="M-28 -14 l-6 6 M-16 -14 l-6 6 M10 -14 l-6 6 M22 -14 l-6 6 M34 -14 l-6 6"
      />
      <rect x={-5} y={-30} width={10} height={52} className="body" />
      <path
        d={`M${-32 - o} 24 q 4 -4 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0`}
        className="ln"
        stroke="var(--water)"
        opacity={0.5 + 0.5 * s.activity}
      />
      <path d="M-32 28 h64" className="ln thin" stroke="var(--water)" />
    </g>
  )
}

export const Treatment: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-26} y={-26} width={52} height={52} rx={4} className="body" />
    <rect
      x={-22}
      y={4}
      width={44}
      height={8}
      fill="var(--muted)"
      opacity={0.35}
    />
    <rect
      x={-22}
      y={12}
      width={44}
      height={10}
      fill="var(--fuel)"
      opacity={0.3}
    />
    <rect
      x={-22}
      y={-22}
      width={44}
      height={26}
      fill="var(--water)"
      opacity={0.35}
    />
    {[-12, 0, 12].map((x, i) => {
      const t = cycle(phase * 0.9 + i * 120)
      return s.activity > 0.02 ? (
        <circle
          key={x}
          cx={x + Math.sin(t * 7) * 2}
          cy={2 - t * 22}
          r={2}
          className="ln thin"
        />
      ) : null
    })}
    <rect x={-26} y={-26} width={52} height={52} rx={4} className="ln" />
  </g>
)

export const Tap: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="body"
      d="M-26 -14 h30 a10 10 0 0 1 10 10 v6 h-8 v-4 a4 4 0 0 0 -4 -4 h-28 Z"
    />
    <rect x={-8} y={-24} width={6} height={10} className="body" />
    <line className="ln" x1={-14} y1={-26} x2={4} y2={-26} strokeWidth={3} />
    <Drops xs={[10, 10, 10]} y0={6} y1={30} phase={phase} amount={s.activity} />
    <path className="ln" d="M-6 32 h32" />
  </g>
)

export const Hydrant: Glyph = ({ s, phase }) => (
  <g>
    <path className="body" d="M-12 30 L-12 -12 a12 12 0 0 1 24 0 L12 30 Z" />
    <rect x={-16} y={-4} width={32} height={6} rx={2} className="body" />
    <circle cx={0} cy={12} r={4} className="ln" />
    <line className="ln" x1={-18} y1={30} x2={18} y2={30} />
    {s.activity > 0.02 &&
      [0, 1, 2].map((i) => {
        const t = cycle(phase * 2 + i * 120)
        return (
          <circle
            key={i}
            cx={16 + t * 18}
            cy={-2 - Math.sin(t * Math.PI) * 14 + t * 14}
            r={2.4}
            fill="var(--water)"
            opacity={1 - t * 0.6}
          />
        )
      })}
  </g>
)

export const River: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.8) * 12
  return (
    <g>
      {[-10, 0, 10].map((y, i) => (
        <path
          key={y}
          className="ln"
          stroke="var(--water)"
          opacity={0.4 + 0.6 * Math.min(1, s.in > 0 ? 1 : 0.3)}
          d={`M${-36 + ((o + i * 5) % 12)} ${y} q 6 -5 12 0 t 12 0 t 12 0 t 12 0 t 12 0`}
        />
      ))}
    </g>
  )
}

export const Weir: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="body"
      d="M-30 -20 h14 v12 h14 v12 h14 v12 h14 v12 h-56 Z"
    />
    {s.in > 0.0001 &&
      [0, 1, 2, 3].map((i) => {
        const t = cycle(phase * 2 + i * 90)
        return (
          <circle
            key={i}
            cx={-20 + t * 44}
            cy={-24 + t * 46}
            r={2.4}
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
    <path className="body" d="M-26 0 L0 -24 L26 0 L26 28 L-26 28 Z" />
    <rect x={12} y={-22} width={7} height={12} className="body" />
    <path className="body" d="M-26 0 L0 -24 L26 0" />
    <Windows
      cells={[
        [-18, 4, 10, 9],
        [8, 4, 10, 9],
      ]}
      level={s.activity}
    />
    <rect x={-5} y={14} width={10} height={14} className="ln" />
  </g>
)

export const City: Glyph = ({ s }) => (
  <g>
    <path
      className="body"
      d="M-34 30 V2 H-22 V-14 H-8 V-30 H8 V-6 H20 V-18 H34 V30 Z"
    />
    <Windows
      cells={[
        [-30, 8, 4, 5],
        [-30, 18, 4, 5],
        [-18, -8, 4, 5],
        [-12, 4, 4, 5],
        [-4, -24, 4, 5],
        [2, -14, 4, 5],
        [-4, -4, 4, 5],
        [2, 8, 4, 5],
        [12, 0, 4, 5],
        [24, -12, 4, 5],
        [28, 0, 4, 5],
        [24, 14, 4, 5],
      ]}
      level={s.activity}
    />
    <line className="ln" x1={-38} y1={30} x2={38} y2={30} />
  </g>
)

export const Hospital: Glyph = ({ s }) => (
  <g>
    <rect x={-28} y={-18} width={56} height={46} className="body" />
    <rect x={-10} y={-30} width={20} height={14} className="body" />
    <path
      d="M-2 -28 h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 v-4 h4 Z"
      fill="var(--alarm)"
    />
    <Windows
      cells={[
        [-22, -10, 7, 6],
        [-8, -10, 7, 6],
        [8, -10, 7, 6],
        [-22, 2, 7, 6],
        [8, 2, 7, 6],
        [15, -10, 7, 6],
      ]}
      level={s.activity}
    />
    <rect x={-6} y={14} width={12} height={14} className="ln" />
  </g>
)

export const Factory: Glyph = ({ s, phase }) => (
  <g>
    <Puffs x={24} y={-32} phase={phase} amount={s.activity * 0.7} r={4} />
    <rect x={19} y={-30} width={9} height={30} className="body" />
    <path
      className="body"
      d="M-34 30 V-6 L-20 -18 V-6 L-6 -18 V-6 L8 -18 V-6 L34 -6 V30 Z"
    />
    <g transform="translate(-14 12)">
      <g transform={`rotate(${phase})`}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect
            key={i}
            x={-2}
            y={-11}
            width={4}
            height={5}
            className="inkf"
            transform={`rotate(${i * 45})`}
          />
        ))}
        <circle r={8} className="body" />
        <circle r={2.5} className="inkf" />
      </g>
    </g>
    <Windows
      cells={[
        [2, 6, 7, 7],
        [14, 6, 7, 7],
        [24, 6, 6, 7],
      ]}
      level={s.activity}
    />
  </g>
)

export const Radiator: Glyph = ({ s }) => (
  <g>
    {[-24, -14, -4, 6, 16].map((x) => (
      <rect
        key={x}
        x={x}
        y={-20}
        width={8}
        height={42}
        rx={4}
        className="body"
      />
    ))}
    {[-24, -14, -4, 6, 16].map((x) => (
      <rect
        key={`h${x}`}
        x={x}
        y={-20}
        width={8}
        height={42}
        rx={4}
        fill="var(--heat)"
        opacity={0.08 + 0.6 * s.activity}
      />
    ))}
    <line className="ln" x1={-28} y1={-14} x2={28} y2={-14} />
    <line className="ln" x1={-28} y1={16} x2={28} y2={16} />
  </g>
)

export const Car: Glyph = ({ s, phase }) => (
  <g>
    <path
      className="body"
      d="M-32 12 V2 L-22 -2 L-12 -14 H12 L22 -2 L32 2 V12 Z"
    />
    <path
      className="ln thin"
      d="M-9 -10 H-1 V-2 H-17 Z M3 -10 H10 L16 -2 H3 Z"
    />
    <circle cx={-18} cy={14} r={7} className="body" />
    <circle cx={18} cy={14} r={7} className="body" />
    <rect x={-18} y={24} width={36} height={6} rx={2} className="ln thin" />
    <rect
      x={-17}
      y={25}
      width={34 * Math.min(1, cycle(phase * 0.1))}
      height={4}
      fill="var(--electric)"
      opacity={s.activity > 0.02 ? 0.9 : 0}
    />
  </g>
)

export const Globe: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.3) * 30
  return (
    <g>
      <circle r={26} className="body" />
      <ellipse rx={11} ry={26} className="ln thin" />
      <line className="ln thin" x1={-26} y1={0} x2={26} y2={0} />
      <path className="ln thin" d="M-23 -12 H23 M-23 12 H23" />
      {s.activity > 0.02 &&
        [0, 1, 2, 3].map((i) => {
          const t = ((o + i * 7.5) % 30) / 30
          const a = rad(t * 360 + i * 40)
          return (
            <circle
              key={i}
              cx={Math.cos(a) * 30}
              cy={Math.sin(a) * 30}
              r={2}
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
      y={-24}
      phase={phase}
      amount={Math.min(1, s.in > 0 ? 0.4 + s.activity : 0)}
      n={4}
      rise={18}
      r={7}
    />
    <path className="body" d="M-24 30 Q -12 0 -16 -24 L16 -24 Q 12 0 24 30 Z" />
    <line className="ln" x1={-30} y1={30} x2={30} y2={30} />
  </g>
)

export const Sky: Glyph = ({ s, phase }) => {
  const o = cycle(phase * 0.5)
  return (
    <g>
      {[-14, 0, 14].map((x, i) => (
        <path
          key={x}
          className="ln"
          stroke="var(--heat)"
          opacity={s.in > 0 ? 0.35 + 0.5 * ((o + i / 3) % 1) : 0.2}
          d={`M${x} 26 q -6 -8 0 -16 t 0 -16 t 0 -16`}
          transform={`translate(0 ${-((o + i / 3) % 1) * 6})`}
        />
      ))}
    </g>
  )
}

export const Fan: Glyph = ({ s, phase }) => (
  <g>
    <rect x={-28} y={-28} width={56} height={56} rx={6} className="body" />
    <circle r={22} className="ln" />
    <Blades n={5} r={19} phase={phase * 2.4} w={7} />
    <circle r={4} className="inkf" />
    <Puffs
      x={0}
      y={-30}
      phase={phase}
      amount={s.in > 0 ? 0.6 : 0}
      n={3}
      rise={10}
      r={4}
    />
  </g>
)

export const Generic: Glyph = () => <circle r={22} className="body" />
