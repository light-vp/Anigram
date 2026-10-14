// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Behaviour } from '../sim/types.ts'

/*
 * The parts catalogue as plain data — what each glyph draws and the role it
 * usually plays. React-free, so the scene validator and the MCP server can
 * read it in node; `index.ts` maps the same ids to their drawings.
 */

export interface KindInfo {
  group:
    | 'source'
    | 'conversion'
    | 'switchgear'
    | 'storage'
    | 'water'
    | 'demand'
    | 'waste'
  /** what the drawing shows, and what moves */
  draws: string
  /** the behaviour role it is normally given */
  role: Behaviour['role']
}

export const PART_KINDS = {
  sun: {
    group: 'source',
    role: 'source',
    draws: 'the sun; rays turn with output',
  },
  wind: {
    group: 'source',
    role: 'source',
    draws: 'wind streams; flow with output',
  },
  pv: {
    group: 'source',
    role: 'converter',
    draws: 'a solar panel; cells colour with output',
  },
  gaswell: { group: 'source', role: 'source', draws: 'a gas wellhead' },
  core: {
    group: 'source',
    role: 'source',
    draws: 'a reactor core; rods glow with output',
  },
  grid: {
    group: 'source',
    role: 'storage',
    draws: 'a pylon standing for the public grid',
  },
  rain: {
    group: 'source',
    role: 'source',
    draws: 'a cloud; rain falls with output',
  },
  air: {
    group: 'source',
    role: 'source',
    draws: 'outside air; a breeze with output',
  },
  transformer: {
    group: 'conversion',
    role: 'converter',
    draws: 'a transformer',
  },
  inverter: {
    group: 'conversion',
    role: 'converter',
    draws: 'an inverter (DC → AC)',
  },
  turbine: {
    group: 'conversion',
    role: 'converter',
    draws: 'a turbine rotor; spins with activity',
  },
  generator: {
    group: 'conversion',
    role: 'converter',
    draws: 'a generator set; rotor dot orbits while running',
  },
  turbogen: {
    group: 'conversion',
    role: 'converter',
    draws: 'a turbine-generator pair; spins with activity',
  },
  gasplant: {
    group: 'conversion',
    role: 'converter',
    draws: 'a gas power station; smoke with activity',
  },
  pump: {
    group: 'conversion',
    role: 'converter',
    draws: 'a centrifugal pump; impeller spins',
  },
  heatpump: {
    group: 'conversion',
    role: 'converter',
    draws: 'a heat pump; fan spins',
  },
  motor: {
    group: 'conversion',
    role: 'converter',
    draws: 'an electric motor; its shaft turns with the load',
  },
  powerpack: {
    group: 'conversion',
    role: 'converter',
    draws:
      'a hydraulic power unit: motor and pump on an oil tank; the coupling turns',
  },
  compressor: {
    group: 'conversion',
    role: 'converter',
    draws: 'an air compressor on its receiver; the flywheel turns',
  },
  servers: {
    group: 'conversion',
    role: 'converter',
    draws: 'a server rack; LEDs blink with load',
  },
  busbar: {
    group: 'switchgear',
    role: 'bus',
    draws: 'a busbar, drawn as a bare bar',
  },
  manifold: {
    group: 'switchgear',
    role: 'bus',
    draws: 'a pipe manifold, drawn as a bare bar',
  },
  breaker: {
    group: 'switchgear',
    role: 'gate',
    draws: 'a circuit breaker; contacts open and close',
  },
  valve: {
    group: 'switchgear',
    role: 'gate',
    draws: 'a valve; fills when open',
  },
  pylon: { group: 'switchgear', role: 'gate', draws: 'a transmission pylon' },
  dcv: {
    group: 'switchgear',
    role: 'gate',
    draws: 'a solenoid directional valve; the spool shifts as it opens',
  },
  battery: {
    group: 'storage',
    role: 'storage',
    draws: 'a battery; charge level fills it',
  },
  reservoir: {
    group: 'storage',
    role: 'storage',
    draws: 'a reservoir; water level rises with fill',
  },
  watertower: {
    group: 'storage',
    role: 'storage',
    draws: 'a water tower; tank level rises with fill',
  },
  hottank: {
    group: 'storage',
    role: 'storage',
    draws: 'a hot water cylinder; fills with heat',
  },
  fueltank: {
    group: 'storage',
    role: 'storage',
    draws: 'a fuel tank; level shows fill',
  },
  oiltank: {
    group: 'storage',
    role: 'storage',
    draws: 'a hydraulic oil tank; level shows fill',
  },
  accumulator: {
    group: 'storage',
    role: 'storage',
    draws: 'a hydraulic accumulator; oil rises against the gas',
  },
  well: { group: 'water', role: 'source', draws: 'a borehole' },
  treatment: {
    group: 'water',
    role: 'converter',
    draws: 'a treatment works; bubbles with flow',
  },
  tap: { group: 'water', role: 'sink', draws: 'a tap; drips with flow' },
  hydrant: {
    group: 'water',
    role: 'sink',
    draws: 'a fire hydrant; sprays when open',
  },
  river: { group: 'water', role: 'vent', draws: 'a river; ripples with flow' },
  weir: {
    group: 'water',
    role: 'vent',
    draws: 'a weir or spillway; water pours over',
  },
  house: {
    group: 'demand',
    role: 'sink',
    draws: 'a house; windows light as it is served',
  },
  city: {
    group: 'demand',
    role: 'sink',
    draws: 'a city skyline; windows light as it is served',
  },
  hospital: {
    group: 'demand',
    role: 'sink',
    draws: 'a hospital; windows light as it is served',
  },
  factory: {
    group: 'demand',
    role: 'sink',
    draws: 'a factory; chimney smokes with activity',
  },
  radiator: {
    group: 'demand',
    role: 'sink',
    draws: 'a radiator; warms with flow',
  },
  car: {
    group: 'demand',
    role: 'sink',
    draws: 'an electric car; charge bar fills',
  },
  cylinder: {
    group: 'demand',
    role: 'storage',
    draws: 'a hydraulic or pneumatic cylinder; the rod extends with fill',
  },
  globe: {
    group: 'demand',
    role: 'sink',
    draws: 'the internet / users; a spinning globe',
  },
  coolingtower: {
    group: 'waste',
    role: 'vent',
    draws: 'a cooling tower; steam with flow',
  },
  sky: { group: 'waste', role: 'vent', draws: 'open sky, where heat goes' },
  fan: {
    group: 'waste',
    role: 'vent',
    draws: 'an extractor fan; spins with flow',
  },
} as const satisfies Record<string, KindInfo>

export type PartKind = keyof typeof PART_KINDS

export function isPartKind(kind: string): kind is PartKind {
  return Object.hasOwn(PART_KINDS, kind)
}
