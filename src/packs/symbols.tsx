// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useId } from 'react'
import type { ReactNode } from 'react'

import type { PartState } from '../sim/solver.ts'
import type { PartSpec, SymbolSet } from '../sim/types.ts'

/*
 * The engineering symbols. Each is drawn in ink on a 44×44 box centred on
 * 0,0, after the shapes of ISO 10628-2 (P&ID) and IEC 60617 / ANSI 315
 * (single-line), redrawn here rather than copied: the standards are paid
 * documents, and the shapes themselves are common practice.
 *
 * They stay alive the way Anigram's pictures are: a valve fills in as it
 * shuts, a tank shows its level, a breaker's blade lifts when it trips, an
 * impeller turns as fast as the pump works. Nothing else moves, so the
 * sheet still prints as a plain drawing.
 *
 * An inline symbol (a valve, a breaker) is drawn for a line running left to
 * right; the sheet turns it when its line runs up and down.
 */

export interface SymbolProps {
  s: PartState
  phase: number
  part: PartSpec
  symbols: SymbolSet
  /** a busbar's reach either side of its centre, to cover every feeder */
  span?: [number, number]
  /** what the part carries, for the colour of the oil or air in it */
  domain?: string
}

export type SymbolGlyph = (props: SymbolProps) => ReactNode

const shut = (s: PartState) => s.open < 0.05

// ---- P&ID ------------------------------------------------------------------

/** a few short curved vanes, turning with the work */
function Impeller({ r, phase }: { r: number; phase: number }) {
  return (
    <g transform={`rotate(${phase * 2})`} className="ln thin">
      {[0, 120, 240].map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d={`M0 ${-r * 0.2} Q ${r * 0.45} ${-r * 0.35} ${r * 0.5} ${-r * 0.8}`}
        />
      ))}
    </g>
  )
}

const CentrifugalPump: SymbolGlyph = ({ phase }) => (
  <g>
    {/* the casing, its discharge leaving along the top, on a foot */}
    <path className="ln sym" d="M-8 10 L-12 17 H12 L8 10" />
    <circle r={13} className="ln sym" />
    <path className="ln" d="M0 -13 H18" />
    <Impeller r={11} phase={phase} />
  </g>
)

const PositiveDisplacementPump: SymbolGlyph = ({ phase }) => (
  <g>
    <circle r={13} className="ln sym" />
    <rect x={-6} y={-6} width={12} height={12} className="ln thin" />
    <g transform={`rotate(${phase})`}>
      <path className="ln thin" d="M0 -6 V6" />
    </g>
  </g>
)

const Compressor: SymbolGlyph = ({ phase }) => (
  <g>
    <circle r={13} className="ln sym" />
    {/* converging, as the gas is squeezed */}
    <path className="ln" d="M-9 -9.5 L9 -5 M-9 9.5 L9 5" />
    <Impeller r={6} phase={phase} />
  </g>
)

const Fan: SymbolGlyph = ({ phase }) => (
  <g>
    <circle r={13} className="ln sym" />
    <g transform={`rotate(${phase * 2})`} className="ln thin">
      {[0, 90, 180, 270].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 0 C 3 -3 3 -8 0 -10" />
      ))}
    </g>
  </g>
)

/** the liquid in a tank or vessel, as high as it is full */
function Level({
  x,
  w,
  top,
  bottom,
  fill,
  tint = 'lvl',
}: {
  x: number
  w: number
  top: number
  bottom: number
  fill: number
  /** the class that colours it, for something other than water */
  tint?: string
}) {
  const f = Math.min(1, Math.max(0, fill))
  const y = bottom - (bottom - top) * f
  if (f < 0.005) return null
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={bottom - y}
        className={f < 0.15 ? 'lvl low' : tint}
      />
      <line x1={x} x2={x + w} y1={y} y2={y} className="ln thin" />
    </g>
  )
}

const Tank: SymbolGlyph = ({ s }) => (
  <g>
    {/* flat bottom, a shallow cone roof */}
    <path className="ln sym" d="M-16 -12 L0 -18 L16 -12 V18 H-16 Z" />
    <Level x={-16} w={32} top={-12} bottom={18} fill={s.fill} />
    <path className="ln" d="M-16 -12 L0 -18 L16 -12 V18 H-16 Z" />
  </g>
)

const Vessel: SymbolGlyph = ({ s }) => (
  <g>
    {/* a vertical drum with dished ends */}
    <rect x={-12} y={-19} width={24} height={38} rx={10} className="ln sym" />
    <Level x={-12} w={24} top={-12} bottom={12} fill={s.fill} />
    <rect x={-12} y={-19} width={24} height={38} rx={10} className="ln" />
  </g>
)

const HeatExchanger: SymbolGlyph = ({ s }) => (
  <g>
    <circle r={14} className="ln sym" />
    <path
      className="ln"
      d="M-14 0 L-8 -6 L-3 6 L3 -6 L8 6 L14 0"
      opacity={0.45 + 0.55 * Math.min(1, s.activity)}
    />
  </g>
)

const Filter: SymbolGlyph = () => (
  <g>
    <path className="ln sym" d="M0 -15 L15 0 L0 15 L-15 0 Z" />
    <path className="ln thin" d="M0 -15 V15" strokeDasharray="3 2.5" />
  </g>
)

/** two triangles point to point; filled in as it shuts */
function Bowtie({ s, extra }: { s: PartState; extra?: ReactNode }) {
  const closed = shut(s)
  return (
    <g>
      <path
        className={closed ? 'ln inkf' : 'ln sym'}
        d="M-11 -7 L11 7 V-7 L-11 7 Z"
      />
      {extra}
    </g>
  )
}

const GateValve: SymbolGlyph = ({ s }) => <Bowtie s={s} />

const GlobeValve: SymbolGlyph = ({ s }) => (
  <Bowtie
    s={s}
    extra={<circle r={2.6} className={shut(s) ? 'sym' : 'inkf'} />}
  />
)

const BallValve: SymbolGlyph = ({ s }) => (
  <Bowtie s={s} extra={<circle r={4} className="ln sym" />} />
)

const CheckValve: SymbolGlyph = () => (
  <g>
    {/* flow passes left to right only */}
    <path className="ln sym" d="M-11 -7 L11 7 V-7 L-11 7 Z" />
    <path className="inkf" d="M11 -7 V7 L0 0 Z" />
  </g>
)

const ButterflyValve: SymbolGlyph = ({ s }) => {
  // the disc turns across the bore as it shuts
  const a = 90 * (1 - Math.min(1, Math.max(0, s.open)))
  return (
    <g>
      <path className="ln" d="M-9 -8 V8 M9 -8 V8 M-9 0 H-6 M6 0 H9" />
      <g transform={`rotate(${-a})`}>
        <path className="ln" d="M-6 0 H6" />
      </g>
      <circle r={2} className="inkf" />
    </g>
  )
}

const SafetyValve: SymbolGlyph = ({ s }) => (
  <g>
    {/* a spring on the bonnet holds it shut until pressure lifts it */}
    <path
      className="ln thin"
      d="M0 -7 V-9 L-4 -11 L4 -14 L-4 -17 L4 -20 L0 -22"
    />
    <Bowtie s={s} />
  </g>
)

const ControlValve: SymbolGlyph = ({ s }) => (
  <g>
    {/* the stem and a diaphragm actuator; the stem lifts as it opens */}
    <path className="ln" d={`M0 0 V${-15 - 2 * s.open}`} />
    <path
      className="ln sym"
      d={`M-9 ${-15 - 2 * s.open} A 9 9 0 0 1 9 ${-15 - 2 * s.open} Z`}
    />
    <Bowtie s={s} />
  </g>
)

const ElectricMotor: SymbolGlyph = () => (
  <g>
    <circle r={13} className="ln sym" />
    <text className="symText">M</text>
  </g>
)

const Junction: SymbolGlyph = () => <circle r={3} className="inkf" />

/** a pentagon pointing the way the flow goes, on or off the drawing (the sheet turns it) */
const OffPageConnector: SymbolGlyph = () => (
  <path className="ln sym" d="M-18 -9 H8 L18 0 L8 9 H-18 Z" />
)

// ---- single-line -------------------------------------------------------------

const Grid: SymbolGlyph = () => (
  <g>
    {/* the supply network: a hatched box feeding down */}
    <rect x={-16} y={-10} width={32} height={20} className="ln sym" />
    <path
      className="ln thin"
      d="M-10 10 L2 -10 M-2 10 L10 -10 M-16 0 L-10 -10 M6 10 L16 -6"
    />
  </g>
)

const Generator: SymbolGlyph = ({ s, symbols }) => (
  <g>
    <circle r={15} className="ln sym" />
    <text className="symText" y={symbols === 'iec' ? -3 : 0}>
      G
    </text>
    {symbols === 'iec' && (
      <path className="ln thin" d="M-5 7 Q -2.5 3.5 0 7 T 5 7" />
    )}
    {s.activity > 0.01 && <circle r={17.5} className="ln thin live" />}
  </g>
)

const Motor: SymbolGlyph = ({ symbols }) => (
  <g>
    <circle r={14} className="ln sym" />
    <text className="symText" y={symbols === 'iec' ? -3 : 0}>
      M
    </text>
    {symbols === 'iec' && (
      <path className="ln thin" d="M-5 7 Q -2.5 3.5 0 7 T 5 7" />
    )}
  </g>
)

const Transformer: SymbolGlyph = ({ symbols }) =>
  symbols === 'ansi' ? (
    <g>
      {/* two windings facing across the core */}
      <path className="ln" d="M-16 0 H-11 M11 0 H16" />
      <path
        className="ln"
        d="M-11 -10 A 2.5 2.5 0 0 1 -11 -5 A 2.5 2.5 0 0 1 -11 0 A 2.5 2.5 0 0 1 -11 5 A 2.5 2.5 0 0 1 -11 10"
        transform="translate(6 0)"
      />
      <path
        className="ln"
        d="M11 -10 A 2.5 2.5 0 0 0 11 -5 A 2.5 2.5 0 0 0 11 0 A 2.5 2.5 0 0 0 11 5 A 2.5 2.5 0 0 0 11 10"
        transform="translate(-6 0)"
      />
      <path className="ln thin" d="M-1.5 -11 V11 M1.5 -11 V11" />
    </g>
  ) : (
    <g>
      <circle cx={-6} r={9} className="ln sym" />
      <circle cx={6} r={9} className="ln" />
    </g>
  )

/** a switch blade between two contacts; it lifts when the switch is open */
function Blade({ s, cross }: { s: PartState; cross?: boolean }) {
  const open = shut(s)
  return (
    <g>
      {/* paper behind the gap, so the line running through the part stops at the contacts */}
      <rect x={-12} y={-4} width={24} height={8} className="mask" />
      <path className="ln" d="M-20 0 H-12 M12 0 H20" />
      <circle cx={-12} r={2} className="inkf" />
      <path
        className={open ? 'ln alarm' : 'ln'}
        d={open ? 'M-12 0 L9 -13' : 'M-12 0 L12 0'}
      />
      {cross ? (
        <path className="ln" d="M8 -4 L16 4 M8 4 L16 -4" />
      ) : (
        <path className="ln" d="M12 -5 V5" />
      )}
    </g>
  )
}

const CircuitBreaker: SymbolGlyph = ({ s, symbols }) =>
  symbols === 'ansi' ? (
    <g>
      {/* a box, filled when closed */}
      <path className="ln" d="M-20 0 H-9 M9 0 H20" />
      <rect
        x={-9}
        y={-9}
        width={18}
        height={18}
        className={shut(s) ? 'ln sym alarmStroke' : 'ln inkf'}
      />
    </g>
  ) : (
    <Blade s={s} cross />
  )

const Disconnector: SymbolGlyph = ({ s }) => <Blade s={s} />

const Fuse: SymbolGlyph = () => (
  <g>
    <path className="ln" d="M-16 0 H16" />
    <rect x={-8} y={-4} width={16} height={8} className="ln sym" />
    <path className="ln" d="M-8 0 H8" />
  </g>
)

const Battery: SymbolGlyph = () => (
  <g>
    {/* cells: long plate positive, short plate negative */}
    <rect x={-12} y={-7} width={24} height={14} className="sym" />
    <path className="ln" d="M0 -18 V-6 M0 6 V18" />
    <path className="ln" d="M-11 -6 H11 M-11 2 H11" />
    <path className="ln heavy" d="M-5 -2 H5 M-5 6 H5" />
    <text className="symText small" x={15} y={-9}>
      +
    </text>
  </g>
)

const PhotovoltaicArray: SymbolGlyph = ({ s }) => (
  <g>
    <rect x={-13} y={-10} width={26} height={20} className="ln sym" />
    <path className="ln thin" d="M-13 10 L13 -10" />
    {/* light falling on it, while it works */}
    <g opacity={s.activity > 0.01 ? 1 : 0.35}>
      <path className="ln thin" d="M-20 -19 L-12 -12 M-14 -20 L-7 -13" />
      <path
        className="inkf"
        d="M-12 -12 l-3.5 -0.6 l2.4 -2.4 Z M-7 -13 l-3.5 -0.6 l2.4 -2.4 Z"
      />
    </g>
  </g>
)

const Inverter: SymbolGlyph = () => (
  <g>
    <rect x={-13} y={-13} width={26} height={26} className="ln sym" />
    <path className="ln thin" d="M-13 13 L13 -13" />
    {/* direct current in the upper corner, alternating in the lower */}
    <path className="ln thin" d="M-9 -7 H-2 M-9 -4 H-2" />
    <path className="ln thin" d="M2 6 Q 4 3 6 6 T 10 6" />
  </g>
)

const Load: SymbolGlyph = () => (
  <g>
    {/* an arrow into whatever it feeds, pointing the way the power goes (the sheet turns it) */}
    <path className="ln" d="M-16 0 H4" />
    <path className="inkf" d="M2 -6 L14 0 L2 6 Z" />
  </g>
)

/** an overhead line or cable: nothing but the line itself, which runs on through */
const Cable: SymbolGlyph = () => null

/** a turbine: the wedge widening the way the flow expands through it */
const Turbine: SymbolGlyph = ({ s }) => (
  <g>
    <path className="ln sym" d="M-14 -7 L14 -15 V15 L-14 7 Z" />
    {s.activity > 0.01 && (
      <path className="ln thin live" d="M-18 -10 L18 -20 V20 L-18 10 Z" />
    )}
  </g>
)

const Busbar: SymbolGlyph = ({ span = [-50, 50] }) => (
  <rect
    x={span[0]}
    y={-2.5}
    width={span[1] - span[0]}
    height={5}
    className="inkf"
  />
)

// ---- fluid power (ISO 1219-1) ------------------------------------------------

type Pt = [number, number]

/** two decimals are plenty on a 44-unit symbol, and keep the markup short */
const r2 = (n: number) => Math.round(n * 100) / 100

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** a straight arrow, its head filled with the tip on `to` */
function Arrow({ from, to, head = 3.6 }: { from: Pt; to: Pt; head?: number }) {
  const [x1, y1] = from
  const [x2, y2] = to
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const w = head * 0.55
  const bx = x2 - ux * head
  const by = y2 - uy * head
  return (
    <g>
      <path
        className="ln thin"
        d={`M${r2(x1)} ${r2(y1)} L${r2(bx)} ${r2(by)}`}
      />
      <path
        className="inkf"
        d={`M${r2(x2)} ${r2(y2)} L${r2(bx - uy * w)} ${r2(by + ux * w)} L${r2(bx + uy * w)} ${r2(by - ux * w)} Z`}
      />
    </g>
  )
}

/** a coil spring, drawn from (x, 0) for `len` along x (negative runs left) */
const springX = (x: number, len: number, h = 4) => {
  const step = len / 4
  return `M${r2(x)} 0 L${r2(x + step / 2)} ${-h} L${r2(x + step * 1.5)} ${h} L${r2(x + step * 2.5)} ${-h} L${r2(x + step * 3.5)} ${h} L${r2(x + len)} 0`
}

/** and from (0, y) for `len` along y */
const springY = (y: number, len: number, h = 4) => {
  const step = len / 4
  return `M0 ${r2(y)} L${-h} ${r2(y + step / 2)} L${h} ${r2(y + step * 1.5)} L${-h} ${r2(y + step * 2.5)} L${h} ${r2(y + step * 3.5)} L0 ${r2(y + len)}`
}

/** the fluid a part carries, for the colour of what fills it */
const fluidClass = (domain: string | undefined) =>
  domain === 'air' ? 'lvl air' : 'lvl oil'

// pumps, compressors and motors: a circle with a triangle at the port, filled
// for oil and hollow for air, pointing out of a pump and into a motor

function Machine({
  s,
  out,
  filled,
  variable,
}: {
  s: PartState
  out: boolean
  filled: boolean
  variable?: boolean
}) {
  const tri = out
    ? 'M0 -12 L3.9 -5.6 L-3.9 -5.6 Z'
    : 'M-4.4 -11.15 L4.4 -11.15 L0 -4.7 Z'
  return (
    <g>
      {/* the drive shaft, coming in from the left */}
      <path className="ln thin" d="M-12 -1.5 H-19 M-12 1.5 H-19" />
      <circle r={12} className="ln sym" />
      <path className={filled ? 'ln inkf' : 'ln sym'} d={tri} />
      {variable && <Arrow from={[-12, 12]} to={[13, -13]} />}
      {s.activity > 0.01 && <circle r={15.5} className="ln thin live" />}
    </g>
  )
}

const HydraulicPump: SymbolGlyph = ({ s }) => <Machine s={s} out filled />
const VariablePump: SymbolGlyph = ({ s }) => (
  <Machine s={s} out filled variable />
)
const HydraulicMotor: SymbolGlyph = ({ s }) => (
  <Machine s={s} out={false} filled />
)
const AirCompressor: SymbolGlyph = ({ s }) => (
  <Machine s={s} out filled={false} />
)
const PneumaticMotor: SymbolGlyph = ({ s }) => (
  <Machine s={s} out={false} filled={false} />
)

/** how far a cylinder's piston has travelled: a store's fill, else how hard it works */
const stroke = (s: PartState, part: PartSpec) =>
  clamp01(part.behaviour.role === 'storage' ? s.fill : s.activity)

/**
 * A cylinder, rod out to the right: the piston and rod sit where the part's
 * fill says, with the pressurised side tinted by what fills it. Ports
 * underneath, the cap end's on the left.
 */
function Cylinder({
  s,
  part,
  domain,
  spring,
}: {
  s: PartState
  part: PartSpec
  domain?: string
  spring?: boolean
}) {
  const x = r2(-15 + 25 * stroke(s, part))
  const barrel = { x: -18, y: -8, width: 32, height: 16 }
  return (
    <g>
      <path className="ln" d={spring ? 'M-14 8 V13' : 'M-14 8 V13 M10 8 V13'} />
      <rect {...barrel} className="ln sym" />
      <rect
        x={-18}
        y={-8}
        width={r2(x + 18)}
        height={16}
        className={fluidClass(domain)}
      />
      {spring && (
        <path className="ln thin" d={springX(x + 1.5, r2(12.5 - x), 5)} />
      )}
      <rect {...barrel} className="ln" />
      <rect x={r2(x + 1.5)} y={-2} width={31.5} height={4} className="ln sym" />
      <rect x={r2(x - 1.5)} y={-8} width={3} height={16} className="inkf" />
    </g>
  )
}

const DoubleActingCylinder: SymbolGlyph = (p) => <Cylinder {...p} />
const SingleActingCylinder: SymbolGlyph = (p) => <Cylinder {...p} spring />

// directional valves: one envelope per position, side by side, with the
// flow paths drawn in each. The ports stay put and the valve body slides
// under them, so the envelope in use is the one the lines join.

interface Envelope {
  /** flow paths, port to port */
  arrows: Array<[Pt, Pt]>
  /** ports shut in this position */
  stops: Pt[]
}

/** a port shut off: a short stub in from the edge, capped */
const stop = ([x, y]: Pt) => {
  const d = y > 0 ? -3.5 : 3.5
  return `M${x} ${y} V${y + d} M${x - 2.5} ${y + d} H${x + 2.5}`
}

/** the solenoid at one end, pulling (filled) or not */
function Solenoid({ x, side, on }: { x: number; side: 1 | -1; on: boolean }) {
  // x is the envelope edge it sits on; side is the way out from the valve
  const x0 = side < 0 ? x - 6 : x
  return (
    <g>
      <rect
        x={x0}
        y={-5}
        width={6}
        height={10}
        className={on ? 'ln inkf' : 'ln sym'}
      />
      <path
        className="ln thin"
        d={`M${x0} 5 L${x0 + 6} -5`}
        style={on ? { stroke: 'var(--paper)' } : undefined}
      />
    </g>
  )
}

function Valve({
  envelopes,
  width,
  active,
  rest,
  ports,
  solenoids,
  springs,
}: {
  envelopes: Envelope[]
  width: number
  /** the envelope in use, and the one the drawing rests in */
  active: number
  rest: number
  /** where the lines join, on the envelope in use */
  ports: Pt[]
  /** a solenoid at the left end, the right, or both; on when its envelope is in use */
  solenoids: Array<'left' | 'right'>
  springs: Array<'left' | 'right'>
}) {
  const n = envelopes.length
  const centre = (k: number) => (k - (n - 1) / 2) * width
  const left = centre(0) - width / 2
  const right = centre(n - 1) + width / 2
  const ends = {
    left: { x: left, side: -1 as const, on: active === 0 && rest !== 0 },
    right: {
      x: right,
      side: 1 as const,
      on: active === n - 1 && rest !== n - 1,
    },
  }
  const springAt = (end: 'left' | 'right') => {
    const e = ends[end]
    const x = solenoids.includes(end) ? e.x + 6 * e.side : e.x
    return springX(x, 8 * e.side)
  }
  return (
    <g>
      {/* the port stubs, fixed to the drawing */}
      <path
        className="ln"
        d={ports
          .map(([x, y]) => `M${x} ${y} V${y + (y > 0 ? 5 : -5)}`)
          .join(' ')}
      />
      <g transform={`translate(${r2(-centre(active))} 0)`}>
        {envelopes.map((e, k) => (
          <g key={k} transform={`translate(${centre(k)} 0)`}>
            <rect
              x={-width / 2}
              y={-8}
              width={width}
              height={16}
              className="ln sym"
            />
            {e.arrows.map(([a, b], i) => (
              <Arrow key={i} from={a} to={b} />
            ))}
            {e.stops.length > 0 && (
              <path className="ln thin" d={e.stops.map(stop).join(' ')} />
            )}
          </g>
        ))}
        {springs.map((end) => (
          <path key={end} className="ln thin" d={springAt(end)} />
        ))}
        {solenoids.map((end) => (
          <Solenoid
            key={end}
            x={ends[end].x}
            side={ends[end].side}
            on={ends[end].on}
          />
        ))}
      </g>
    </g>
  )
}

/** a 4-way valve's ports on a 16-wide envelope: A and B on top, P and T below */
const A: Pt = [-4, -8]
const B: Pt = [4, -8]
const P: Pt = [-4, 8]
const T: Pt = [4, 8]
const STRAIGHT: Envelope = {
  arrows: [
    [P, A],
    [B, T],
  ],
  stops: [],
}
const CROSSED: Envelope = {
  arrows: [
    [P, B],
    [A, T],
  ],
  stops: [],
}

/** which of three positions: 0 in the centre, 0.5 crossed, 1 straight through */
const threeWay = (open: number) => (open < 0.05 ? 1 : open > 0.75 ? 0 : 2)
/** and of two: the solenoid's envelope when open, the spring's when not */
const twoWay = (open: number) => (open >= 0.5 ? 0 : 1)

const DirectionalValve43: SymbolGlyph = ({ s }) => (
  <Valve
    envelopes={[STRAIGHT, { arrows: [], stops: [A, B, P, T] }, CROSSED]}
    width={16}
    active={threeWay(s.open)}
    rest={1}
    ports={[A, B, P, T]}
    solenoids={['left', 'right']}
    springs={['left', 'right']}
  />
)

const DirectionalValve42: SymbolGlyph = ({ s }) => (
  <Valve
    envelopes={[STRAIGHT, CROSSED]}
    width={16}
    active={twoWay(s.open)}
    rest={1}
    ports={[A, B, P, T]}
    solenoids={['left']}
    springs={['right']}
  />
)

const DirectionalValve52: SymbolGlyph = ({ s }) => {
  // pneumatic numbering: 4 and 2 on top, exhaust 5, supply 1, exhaust 3 below
  const p4: Pt = [-6, -8]
  const p2: Pt = [6, -8]
  const p5: Pt = [-7, 8]
  const p1: Pt = [0, 8]
  const p3: Pt = [7, 8]
  return (
    <Valve
      envelopes={[
        {
          arrows: [
            [p1, p4],
            [p2, p3],
          ],
          stops: [p5],
        },
        {
          arrows: [
            [p1, p2],
            [p4, p5],
          ],
          stops: [p3],
        },
      ]}
      width={22}
      active={twoWay(s.open)}
      rest={1}
      ports={[p4, p2, p5, p1, p3]}
      solenoids={['left']}
      springs={['right']}
    />
  )
}

const DirectionalValve32: SymbolGlyph = ({ s }) => (
  <Valve
    envelopes={[
      { arrows: [[P, A]], stops: [T] },
      { arrows: [[A, T]], stops: [P] },
    ]}
    width={16}
    active={twoWay(s.open)}
    rest={1}
    ports={[A, P, T]}
    solenoids={['left']}
    springs={['right']}
  />
)

/**
 * a pressure valve in its envelope, flow left to right: the arrow sits off
 * the line while it is shut and slides into it as it opens. A spring on top
 * holds it; a pilot line from the inlet (relief) or the outlet (reducing)
 * pushes back from below.
 */
function PressureValve({ open, pilot }: { open: number; pilot: 'in' | 'out' }) {
  const y = r2(4.5 * (1 - clamp01(open)))
  const px = pilot === 'in' ? -12 : 12
  return (
    <g>
      <rect x={-9} y={-9} width={18} height={18} className="ln sym" />
      <Arrow from={[-6.5, y]} to={[6.5, y]} />
      <path className="ln thin" d={springY(-9, -9)} />
      <Arrow from={[-5, -11]} to={[5.5, -19.5]} head={3} />
      <path className="ln thin dashed" d={`M${px} 0 V14 H0 V9`} />
    </g>
  )
}

const ReliefValve: SymbolGlyph = ({ s }) => (
  // shut until the pressure behind it lifts it
  <PressureValve open={s.out > 1e-6 ? s.open : 0} pilot="in" />
)

const ReducingValve: SymbolGlyph = ({ s }) => (
  <PressureValve open={s.open} pilot="out" />
)

/** a ball on a seat that points the way flow is stopped; it lifts while flow passes */
function Check({ lift, r = 3.5 }: { lift: boolean; r?: number }) {
  // the seat's arms open out from the apex, and the ball sits snug between them
  const apex = -6
  const arm: Pt = [1, 6.5]
  const sin = arm[1] / Math.hypot(arm[0] - apex, arm[1])
  const cx = r2(apex + r / sin + (lift ? 3 : 0))
  return (
    <g>
      <path
        className="ln"
        d={`M${arm[0]} ${-arm[1]} L${apex} 0 L${arm[0]} ${arm[1]}`}
      />
      <circle cx={cx} r={r} className="ln sym" />
    </g>
  )
}

const NonReturnValve: SymbolGlyph = ({ s }) => (
  <g>
    <path className="ln" d="M-15 0 H-6 M2 0 H15" />
    <Check lift={s.out > 1e-6} />
  </g>
)

/** two curves pinching the line; the gap closes as the part shuts */
function Throttle({
  open,
  x = 0,
  size = 1,
}: {
  open: number
  x?: number
  size?: number
}) {
  const g = (1.4 + 2.4 * clamp01(open)) * size
  const w = 6 * size
  const h = 7 * size
  const c = r2(h - 2 * g)
  return (
    <path
      className="ln"
      d={`M${x - w} ${-h} Q${x} ${c} ${x + w} ${-h} M${x - w} ${h} Q${x} ${-c} ${x + w} ${h}`}
    />
  )
}

const ThrottleValve: SymbolGlyph = ({ s }) => (
  <g>
    <path className="ln" d="M-15 0 H15" />
    <Throttle open={s.open} />
    <Arrow from={[-9, 10]} to={[9.5, -10.5]} />
  </g>
)

const FlowControlValve: SymbolGlyph = ({ s }) => (
  <g>
    {/* a throttle in the line, and a non-return valve in the bypass for the way back */}
    <path className="ln" d="M-15 0 H15 M-11 0 V-13 H-6.5 M3 -13 H11 V0" />
    <Throttle open={s.open} size={0.8} />
    <Arrow from={[-7, 8.5]} to={[7.5, -8]} head={3} />
    <g transform="translate(-1 -13) rotate(180)">
      <Check lift={false} r={2.8} />
    </g>
  </g>
)

const ShuttleValve: SymbolGlyph = () => (
  <g>
    <path className="ln" d="M-17 0 H-12 M12 0 H17 M0 -6 V-12" />
    <rect x={-12} y={-6} width={24} height={12} className="ln sym" />
    <circle r={3.5} className="ln sym" />
  </g>
)

const ShutOffValve: SymbolGlyph = ({ s }) => <Bowtie s={s} />

const AirServiceUnit: SymbolGlyph = () => (
  <g>
    <rect x={-17} y={-9} width={34} height={18} className="ln sym" />
    {/* filter, regulator, lubricator */}
    <path className="ln thin" d="M-10 -5.5 L-5 0 L-10 5.5 L-15 0 Z" />
    <path className="ln thin dashed" d="M-10 -5.5 V5.5" />
    <Arrow from={[0, 6]} to={[0, -6]} head={3} />
    <path className="ln thin" d="M10 -5.5 L15 0 L10 5.5 L5 0 Z M10 -3 V3" />
  </g>
)

const Accumulator: SymbolGlyph = ({ s, part, domain }) => {
  // the oil comes up from the port, squeezing the gas into the top
  const f = part.behaviour.role === 'storage' ? clamp01(s.fill) : 0.5
  const y = r2(6 - 10 * f)
  const id = `acc${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <g>
      <path className="ln" d="M0 12 V18" />
      <clipPath id={id}>
        <rect x={-8} y={-14} width={16} height={26} rx={8} />
      </clipPath>
      <rect x={-8} y={-14} width={16} height={26} rx={8} className="ln sym" />
      <rect
        x={-8}
        y={y}
        width={16}
        height={r2(12 - y)}
        className={fluidClass(domain)}
        clipPath={`url(#${id})`}
      />
      <rect x={-8} y={-14} width={16} height={26} rx={8} className="ln" />
      <path className="ln" d={`M-8 ${y} H8`} />
      <path className="ln sym" d="M-3.5 -6.5 L0 -11 L3.5 -6.5 Z" />
    </g>
  )
}

const Reservoir: SymbolGlyph = ({ s, part, domain }) => (
  <g>
    {part.behaviour.role === 'storage' && (
      <Level
        x={-12}
        w={24}
        top={-7}
        bottom={4}
        fill={s.fill}
        tint={fluidClass(domain)}
      />
    )}
    {/* open to atmosphere: the lines run in over the top */}
    <path className="ln" d="M-12 -7 V4 H12 V-7" />
  </g>
)

const Silencer: SymbolGlyph = () => (
  <g>
    <path className="ln" d="M-16 0 H-5" />
    <rect x={-5} y={-7} width={10} height={14} className="ln sym" />
    <path className="ln thin" d="M-1.7 -7 V7 M1.7 -7 V7" />
  </g>
)

const Exhaust: SymbolGlyph = () => (
  <g>
    <path className="ln" d="M-16 0 H-3" />
    <path className="ln sym" d="M-3 -5 L5 0 L-3 5 Z" />
  </g>
)

const PressureGauge: SymbolGlyph = ({ s, part }) => {
  // the needle reads the pressure where the part is rated, else points up the scale
  const max = part.effort?.max
  const v = Number.isFinite(s.effortIn) ? s.effortIn : s.effort
  const a = max && Number.isFinite(v) ? -135 + 270 * clamp01(v / max) : 45
  const t = ((a - 90) * Math.PI) / 180
  return (
    <g>
      <path className="ln" d="M0 9 V14" />
      <circle r={9} className="ln sym" />
      <Arrow
        from={[r2(-Math.cos(t) * 6), r2(-Math.sin(t) * 6)]}
        to={[r2(Math.cos(t) * 7), r2(Math.sin(t) * 7)]}
        head={3}
      />
    </g>
  )
}

const PressureSource: SymbolGlyph = ({ domain }) => (
  <g>
    <circle r={7} className="ln sym" />
    <path
      className={domain === 'air' ? 'ln sym' : 'ln inkf'}
      d="M-2.5 -3.5 L3.8 0 L-2.5 3.5 Z"
    />
  </g>
)

/** what a part with no symbol in this practice draws as: its class or kind in a box that fits it */
export const Block = ({ name }: { name: string }) => {
  const w = Math.max(40, name.length * 5.4 + 10)
  return (
    <g>
      <rect
        x={-w / 2}
        y={-13}
        width={w}
        height={26}
        rx={2}
        className="ln sym"
      />
      <text className="symText small">{name}</text>
    </g>
  )
}

const SYMBOLS: Record<string, SymbolGlyph> = {
  CentrifugalPump,
  PositiveDisplacementPump,
  Compressor,
  Fan,
  Tank,
  Vessel,
  HeatExchanger,
  Filter,
  GateValve,
  GlobeValve,
  BallValve,
  CheckValve,
  ButterflyValve,
  SafetyValve,
  ControlValve,
  ElectricMotor,
  Junction,
  OffPageConnector,
  Grid,
  Generator,
  Motor,
  Transformer,
  CircuitBreaker,
  Disconnector,
  Fuse,
  Battery,
  PhotovoltaicArray,
  Inverter,
  Load,
  Busbar,
  Cable,
  Turbine,
  HydraulicPump,
  VariablePump,
  HydraulicMotor,
  AirCompressor,
  PneumaticMotor,
  DoubleActingCylinder,
  SingleActingCylinder,
  DirectionalValve43,
  DirectionalValve42,
  DirectionalValve52,
  DirectionalValve32,
  ReliefValve,
  ReducingValve,
  NonReturnValve,
  ThrottleValve,
  FlowControlValve,
  ShuttleValve,
  ShutOffValve,
  AirServiceUnit,
  Accumulator,
  Reservoir,
  Silencer,
  Exhaust,
  PressureGauge,
  PressureSource,
}

/** a part's symbol in this practice, or a labelled box when the practice has none */
export function PackSymbol({
  cls,
  name,
  ...props
}: SymbolProps & { cls: string | undefined; name: string }) {
  const Glyph = cls ? SYMBOLS[cls] : undefined
  return Glyph ? <Glyph {...props} /> : <Block name={name} />
}
