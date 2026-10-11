// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

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
}: {
  x: number
  w: number
  top: number
  bottom: number
  fill: number
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
        className={f < 0.15 ? 'lvl low' : 'lvl'}
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
