// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { didYouMean } from '../sim/suggest.ts'
import type {
  Domain,
  DrawingType,
  LinkSpec,
  PartSpec,
  Scene,
} from '../sim/types.ts'

/*
 * What each engineering drawing practice can draw, as plain data: the
 * classes it has a symbol for, and which class each pictorial kind becomes
 * when a sheet is drawn in that practice. React-free, so the validator and
 * the MCP guide can read it; `symbols.tsx` holds the drawings themselves.
 *
 * P&ID classes are named after DEXPI's, so a P&ID can leave Anigram as DEXPI
 * later without renaming anything. Single-line classes are named for what
 * IEC 60617 and ANSI/IEEE 315 both draw, and fluid-power classes for what
 * ISO 1219-1 calls them.
 */

export interface ClassInfo {
  /** what it is, for the guide */
  is: string
  /** sits in a line rather than at the end of one, so it turns with the line */
  inline?: boolean
  /** ends a line, so it points the way the flow goes */
  terminal?: boolean
  /**
   * sits in a line and has a way round (a non-return valve, a relief
   * valve), so it turns to point the way the flow goes
   */
  directed?: boolean
  /**
   * where its lines join it: a directional valve's A and B on top and P
   * and T underneath, a cylinder's two ends. A line arriving from above or
   * below is moved onto a free port, the inlet onto `supply`, the rest in
   * order across.
   */
  ports?: Ports
  /** how far it reaches either side of its centre, at most, when that is past its tile */
  reach?: number
}

export interface Ports {
  /** how far above and below the centre the ports are */
  edge: number
  /** the ports along the top and the bottom, left to right */
  top?: number[]
  bottom?: number[]
  /** which bottom port the line coming in takes: a valve's P */
  supply?: number
}

export interface PackInfo {
  drawing: DrawingType
  name: string
  /** the standards it follows, for the guide and the title block */
  follows: string
  classes: Record<string, ClassInfo>
  /** the class a pictorial kind is drawn as, when a part names no class */
  fromKind: Record<string, string>
  /**
   * the flows the practice draws. A P&ID leaves out the power cables, a
   * single-line everything but the power; a part with none of its links
   * shown is left off the sheet.
   */
  shows: readonly Domain[]
}

const PID: PackInfo = {
  drawing: 'pid',
  name: 'P&ID',
  follows: 'ISO 10628-2 symbols, ISA-5.1 tags and lines',
  classes: {
    CentrifugalPump: { is: 'a centrifugal pump' },
    PositiveDisplacementPump: { is: 'a positive displacement pump' },
    Compressor: { is: 'a compressor' },
    Fan: { is: 'a fan or blower' },
    Tank: { is: 'an atmospheric storage tank; shows its level' },
    Vessel: { is: 'a pressure vessel or drum; shows its level' },
    HeatExchanger: { is: 'a heat exchanger' },
    Filter: { is: 'a filter or strainer' },
    GateValve: { is: 'an isolating valve; filled when shut', inline: true },
    GlobeValve: { is: 'a globe valve; filled when shut', inline: true },
    BallValve: { is: 'a ball valve; filled when shut', inline: true },
    CheckValve: { is: 'a non-return valve', inline: true },
    ButterflyValve: {
      is: 'a butterfly valve; its disc turns across the bore as it shuts',
      inline: true,
    },
    SafetyValve: {
      is: 'a spring-loaded safety or relief valve; shut until pressure lifts it',
      inline: true,
    },
    ControlValve: {
      is: 'a valve with an actuator; its opening follows the signal',
      inline: true,
    },
    ElectricMotor: { is: 'an electric motor' },
    Turbine: { is: 'a steam, gas or hydraulic turbine' },
    Junction: { is: 'where lines meet; a tee or header' },
    OffPageConnector: {
      is: 'where a line leaves or joins the sheet; sources and consumers off the drawing',
      terminal: true,
    },
  },
  fromKind: {
    pump: 'CentrifugalPump',
    heatpump: 'Compressor',
    fan: 'Fan',
    valve: 'GateValve',
    reservoir: 'Tank',
    watertower: 'Tank',
    hottank: 'Vessel',
    fueltank: 'Tank',
    treatment: 'Filter',
    turbine: 'Turbine',
  },
  // a shaft is not a line on a P&ID: the machine at its end is drawn by what it does
  shows: ['water', 'heat', 'fuel', 'data'],
}

const SINGLE_LINE: PackInfo = {
  drawing: 'single-line',
  name: 'single-line diagram',
  follows: 'IEC 60617 (or ANSI/IEEE 315) symbols, IEC 81346 tags',
  classes: {
    Grid: { is: 'the utility supply' },
    Generator: { is: 'a generator' },
    Transformer: { is: 'a two-winding transformer', inline: true },
    CircuitBreaker: {
      is: 'a circuit breaker; drawn open or closed',
      inline: true,
    },
    Disconnector: { is: 'an isolator; drawn open or closed', inline: true },
    Fuse: { is: 'a fuse', inline: true },
    Battery: { is: 'a battery' },
    PhotovoltaicArray: { is: 'a PV array' },
    Inverter: { is: 'an inverter (DC to AC)', inline: true },
    Motor: { is: 'a motor' },
    Load: { is: 'a load: a feeder to whatever it supplies', terminal: true },
    Busbar: { is: 'a busbar, drawn as a heavy bar' },
    Cable: {
      is: 'an overhead line or cable: drawn as the line itself',
      inline: true,
    },
  },
  fromKind: {
    grid: 'Grid',
    pylon: 'Cable',
    generator: 'Generator',
    turbine: 'Generator',
    wind: 'Generator',
    turbogen: 'Generator',
    gasplant: 'Generator',
    transformer: 'Transformer',
    breaker: 'CircuitBreaker',
    battery: 'Battery',
    pv: 'PhotovoltaicArray',
    inverter: 'Inverter',
    pump: 'Motor',
    heatpump: 'Motor',
    fan: 'Motor',
    busbar: 'Busbar',
    house: 'Load',
    city: 'Load',
    hospital: 'Load',
    factory: 'Load',
    car: 'Load',
    servers: 'Load',
    radiator: 'Load',
  },
  shows: ['electric'],
}

const PFD: PackInfo = {
  drawing: 'pfd',
  name: 'process flow diagram',
  follows: 'ISO 10628-1 major equipment and streams',
  classes: Object.fromEntries(
    Object.entries(PID.classes).filter(
      ([c]) => !c.endsWith('Valve') && c !== 'ElectricMotor',
    ),
  ),
  fromKind: Object.fromEntries(
    Object.entries(PID.fromKind).filter(([k]) => k !== 'valve'),
  ),
  shows: ['water', 'heat', 'fuel'],
}

/** a 4-way valve's ports, a quarter of its 16-wide envelope in from each side */
const VALVE_PORTS: Ports = {
  edge: 8,
  top: [-4, 4],
  bottom: [-4, 4],
  supply: 0,
}

const FLUID_POWER: PackInfo = {
  drawing: 'fluid-power',
  name: 'fluid-power circuit',
  follows: 'ISO 1219-1 symbols, laid out and tagged after ISO 1219-2',
  classes: {
    HydraulicPump: { is: 'a fixed-displacement hydraulic pump' },
    VariablePump: { is: 'a variable-displacement hydraulic pump' },
    HydraulicMotor: { is: 'a hydraulic motor' },
    AirCompressor: { is: 'an air compressor' },
    PneumaticMotor: { is: 'a pneumatic motor' },
    ElectricMotor: { is: 'an electric motor driving a pump or compressor' },
    DoubleActingCylinder: {
      is: 'a double-acting cylinder; its piston and rod follow its fill',
      ports: { edge: 8, bottom: [-14, 10] },
      reach: 44,
    },
    SingleActingCylinder: {
      is: 'a single-acting cylinder with spring return; its piston and rod follow its fill',
      ports: { edge: 8, bottom: [-14] },
      reach: 44,
    },
    DirectionalValve43: {
      is: 'a 4/3 directional valve, closed centre, solenoids and centring springs; its open picks the envelope: 0 the centre, 0.5 crossed (P to B), 1 straight through (P to A)',
      ports: VALVE_PORTS,
      reach: 54,
    },
    DirectionalValve42: {
      is: 'a 4/2 directional valve, solenoid and spring return; open shifts it from crossed to straight through',
      ports: VALVE_PORTS,
      reach: 38,
    },
    DirectionalValve52: {
      is: 'a 5/2 directional valve, solenoid and spring return; open shifts it',
      ports: { edge: 8, top: [-6, 6], bottom: [-7, 0, 7], supply: 1 },
      reach: 47,
    },
    DirectionalValve32: {
      is: 'a 3/2 directional valve, normally closed, solenoid and spring return; open lets it through',
      ports: { edge: 8, top: [-4], bottom: [-4, 4], supply: 0 },
      reach: 38,
    },
    ReliefValve: {
      is: 'a pressure relief valve; shut, and lifting as it opens',
      inline: true,
      directed: true,
    },
    ReducingValve: {
      is: 'a pressure reducing valve; open, and closing in as it throttles',
      inline: true,
      directed: true,
    },
    NonReturnValve: {
      is: 'a non-return (check) valve; the ball lifts while it passes flow',
      inline: true,
      directed: true,
    },
    ThrottleValve: {
      is: 'an adjustable throttle; its gap closes as it shuts',
      inline: true,
    },
    FlowControlValve: {
      is: 'a one-way flow control valve: a throttle with a non-return bypass',
      inline: true,
      directed: true,
    },
    ShuttleValve: { is: 'a shuttle valve: either inlet to the outlet' },
    ShutOffValve: { is: 'a shut-off valve; filled when shut', inline: true },
    Filter: { is: 'a filter', inline: true },
    AirServiceUnit: {
      is: 'an air service unit: filter, regulator and lubricator',
      inline: true,
    },
    Accumulator: { is: 'a gas-loaded accumulator; shows its oil' },
    Reservoir: {
      is: 'the reservoir, open to atmosphere; drawn at every line that returns to it',
    },
    Silencer: { is: 'an exhaust silencer', terminal: true },
    Exhaust: { is: 'an exhaust to atmosphere', terminal: true },
    PressureGauge: { is: 'a pressure gauge' },
    PressureSource: {
      is: 'a pressure source off the drawing: filled for oil, hollow for air',
      terminal: true,
    },
    Junction: { is: 'where lines meet' },
  },
  fromKind: {
    pump: 'HydraulicPump',
    powerpack: 'HydraulicPump',
    compressor: 'AirCompressor',
    motor: 'ElectricMotor',
    cylinder: 'DoubleActingCylinder',
    dcv: 'DirectionalValve43',
    valve: 'ShutOffValve',
    accumulator: 'Accumulator',
    oiltank: 'Reservoir',
    reservoir: 'Reservoir',
    treatment: 'Filter',
    manifold: 'Junction',
    sky: 'Exhaust',
  },
  // the power cables are left off, as on a P&ID; a shaft joins a motor to its pump
  shows: ['oil', 'air', 'mechanical'],
}

export const PACKS: Partial<Record<DrawingType, PackInfo>> = {
  pid: PID,
  'single-line': SINGLE_LINE,
  pfd: PFD,
  'fluid-power': FLUID_POWER,
}

/** how far a class reaches either side of its centre, from whichever pack has it */
export function reachOf(cls: string): number {
  for (const pack of Object.values(PACKS))
    if (pack && cls in pack.classes) return pack.classes[cls]!.reach ?? 22
  return 22
}

/** the class a part is drawn as on this sheet, or undefined for a labelled block */
export function classOf(
  part: PartSpec,
  scene: Pick<Scene, 'drawing'>,
): string | undefined {
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  if (!pack) return undefined
  if (part.class && part.class in pack.classes) return part.class
  if (part.class) return undefined
  const fromKind = pack.fromKind[part.kind]
  if (fromKind && fromKind in pack.classes) return fromKind
  const r = part.behaviour.role
  if (pack.drawing === 'single-line')
    return {
      sink: 'Load',
      bus: 'Busbar',
      gate: 'CircuitBreaker',
      // something that makes power on the drawing is a generator; the grid says so
      source: 'Generator',
    }[r as string]
  if (pack.drawing === 'fluid-power')
    return {
      // oil or air from off the drawing; a return to the tank; air let go
      source: 'PressureSource',
      sink: 'Reservoir',
      vent: 'Exhaust',
      bus: 'Junction',
      gate: 'ShutOffValve',
    }[r as string]
  // whatever comes in from off the drawing, or goes out to it
  if (r === 'source' || r === 'sink' || r === 'vent') return 'OffPageConnector'
  if (r === 'bus') return 'Junction'
  if (r === 'gate') return pack.drawing === 'pid' ? 'GateValve' : 'Junction'
  return undefined
}

/** whether an engineering drawing draws this link: a P&ID leaves the power cables out */
export function shows(link: LinkSpec, scene: Pick<Scene, 'drawing'>): boolean {
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  return !pack || pack.shows.includes(link.domain)
}

/** the parts an engineering drawing draws: those with at least one link it shows */
export function shownParts(
  scene: Pick<Scene, 'drawing' | 'parts' | 'links'>,
): Set<string> {
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  if (!pack) return new Set(scene.parts.map((p) => p.id))
  const ids = new Set<string>()
  for (const l of scene.links)
    if (shows(l, scene)) {
      ids.add(l.from)
      ids.add(l.to)
    }
  return ids
}

/** warnings for parts the sheet's practice can't draw properly */
export function packWarnings(
  scene: Pick<Scene, 'drawing' | 'parts' | 'links'>,
): string[] {
  const pack = scene.drawing ? PACKS[scene.drawing] : undefined
  if (!pack) return []
  const out: string[] = []
  const names = Object.keys(pack.classes)
  const shown = shownParts(scene as Scene)
  for (const p of scene.parts) {
    if (!shown.has(p.id)) continue
    if (p.class && !(p.class in pack.classes))
      out.push(
        `parts (${p.id}).class: a ${pack.name} has no "${p.class}"${didYouMean(p.class, names)}; it draws as a labelled box. The classes are ${names.join(', ')}`,
      )
    else if (!p.class && !classOf(p, scene))
      out.push(
        `parts (${p.id}): a ${p.kind} has no ${pack.name} symbol, so it draws as a labelled box; give it a class (${names.join(', ')})`,
      )
  }
  return out
}
